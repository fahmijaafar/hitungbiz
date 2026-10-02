"""Entitlement service.

Centralizes all subscription plan limit logic. Features should call
``check_entitlement`` to determine whether an operation is allowed; they
must NOT contain plan-specific branching themselves.

Supported features (active enforcement):
  - companies  (Personal=2,  Pro=10,   Max=100)
  - staff      (Personal=1,  Pro=5,    Max=unlimited)
  - products   (Personal=50, Pro=500,  Max=unlimited)
  - customers  (Personal=50, Pro=1000, Max=unlimited)
  - documents  (Personal=20/month, Pro=2000/month, Max=unlimited)
  - ocr        (Personal=10/month, Pro=500/month, Max=unlimited)
  - ai_summary (Personal=1/24h, Pro=unlimited, Max=unlimited)
  - recurring_invoices (Personal=none, Pro=unlimited, Max=unlimited)

Future features (limits defined but NOT yet enforced):
  - integrations
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlmodel import Session, col, func, select

from app.models import Client, Product, SubscriptionUsage, User
from app.services.subscription_service import (
    get_current_subscription,
    get_effective_plan,
    is_subscription_active,
)


# ---------------------------------------------------------------------------
# Plan limits — single backend source of truth
# ---------------------------------------------------------------------------
# int   = fixed limit/quota (usage must be strictly less than this to be allowed)
# None  = unlimited   (operation always allowed for this feature on this plan)
#
# Add new features by adding a key to every plan dict. The entitlement check
# will automatically handle them once ``check_entitlement`` is called with
# the feature name.

PLAN_LIMITS: dict[str, dict[str, int | None]] = {
    "personal": {
        "companies": 2,
        "staff": 1,
        "products": 50,
        "customers": 50,
        "documents": 20,
        "ocr": 10,
        "ai_summary": 1,
        "recurring_invoices": 0,
        # "integrations": 0,
    },
    "pro": {
        "companies": 10,
        "staff": 5,
        "products": 500,
        "customers": 1000,
        "documents": 2000,
        "ocr": 500,
        "ai_summary": None,
        "recurring_invoices": None,
        # "integrations": None,
    },
    "max": {
        "companies": 100,
        "staff": None,
        "products": None,
        "customers": None,
        "documents": None,
        "ocr": None,
        "ai_summary": None,
        "recurring_invoices": None,
        # "integrations": None,
    },
}

FEATURE_LIMIT_TYPES: dict[str, str] = {
    "companies": "resource",
    "staff": "resource",
    "products": "resource",
    "customers": "resource",
    "documents": "monthly",
    "ocr": "monthly",
    "ai_summary": "cooldown",
    "recurring_invoices": "feature_access",
}

AI_SUMMARY_COOLDOWN = timedelta(hours=24)

# Upgrade hierarchy — used to suggest the next plan in error responses
UPGRADE_PATH: dict[str, str | None] = {
    "personal": "pro",
    "pro": "max",
    "max": None,
}


# ---------------------------------------------------------------------------
# Exception
# ---------------------------------------------------------------------------

@dataclass
class LimitReachedException(Exception):
    """Raised by ``check_entitlement`` when the user has hit their plan limit.

    The route layer is responsible for converting this into an HTTPException
    with the appropriate status code and structured body.
    """

    feature: str
    plan: str
    limit: int
    current_usage: int
    next_plan: str | None
    limit_type: str = "resource"
    retry_at: datetime | None = None


@dataclass
class EntitlementStatus:
    """Structured entitlement status for a feature."""

    feature: str
    plan: str
    limit: int | None
    current_usage: int
    over_limit: bool
    can_create: bool
    limit_type: str = "resource"
    retry_at: datetime | None = None


# ---------------------------------------------------------------------------
# Usage helpers
# ---------------------------------------------------------------------------

def get_company_count(user: User, session: Session | None = None) -> int:
    """Return the number of companies the user owns / has access to.

    Hides the implementation detail of ``user.companies`` being a JSON
    string so that future refactors (e.g. a proper join table) only need
    to update this function — not every caller.
    """
    try:
        ids = json.loads(user.companies or "[]")
    except (json.JSONDecodeError, TypeError):
        ids = []
    if not isinstance(ids, list):
        ids = []

    if user.company_id and str(user.company_id) not in ids:
        ids.append(str(user.company_id))

    if session is not None and user.id is not None:
        from app.models import Company

        owned_companies = session.exec(
            select(Company.id).where(
                Company.user_id == user.id,
                col(Company.is_active).is_(True),
            )
        ).all()
        for oc_id in owned_companies:
            oc_str = str(oc_id)
            if oc_str not in ids:
                ids.append(oc_str)

    return len(ids)


def get_staff_count(session: Session, company_id: uuid.UUID) -> int:
    """Return the number of staff members (owner + members) for a company.

    Mirrors the logic in ``read_company_staff``:
    - The company owner (Company.user_id == user.id) is counted.
    - Any user whose ``companies`` JSON array contains the company ID is counted.
    - Any user whose ``company_id`` FK equals the company ID is counted.

    Does NOT add an ORM relationship; queries Users directly to stay in sync
    with the existing implementation.
    """
    from app.models import Company  # local import avoids circular at module level

    company = session.get(Company, company_id)
    if not company:
        return 0

    company_id_str = str(company_id)
    users = session.exec(select(User)).all()

    count = 0
    for user in users:
        is_owner = company.user_id is not None and user.id == company.user_id

        user_companies: list[str] = []
        try:
            user_companies = json.loads(user.companies or "[]")
        except (json.JSONDecodeError, TypeError):
            pass
        if not isinstance(user_companies, list):
            user_companies = []

        is_member = (
            company_id_str in user_companies
            or (user.company_id is not None and str(user.company_id) == company_id_str)
        )

        if is_owner or is_member:
            count += 1

    return count


def get_product_count(session: Session, company_id: uuid.UUID) -> int:
    """Return the number of products belonging to a company."""
    statement = (
        select(func.count())
        .select_from(Product)
        .where(col(Product.company_id) == company_id)
    )
    return session.exec(statement).one()


def get_client_count(session: Session, company_id: uuid.UUID) -> int:
    """Return the number of clients (customers) belonging to a company."""
    statement = (
        select(func.count())
        .select_from(Client)
        .where(col(Client.company_id) == company_id)
    )
    return session.exec(statement).one()


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_aware(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def get_monthly_period(now: datetime | None = None) -> tuple[datetime, datetime]:
    """Return the UTC calendar-month period containing ``now``."""
    current = _ensure_aware(now or _now_utc()).astimezone(timezone.utc)
    period_start = current.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if period_start.month == 12:
        period_end = period_start.replace(year=period_start.year + 1, month=1)
    else:
        period_end = period_start.replace(month=period_start.month + 1)
    return period_start, period_end


def _usage_statement(
    user_id: uuid.UUID,
    feature: str,
    period_type: str,
    period_start: datetime | None = None,
):
    statement = (
        select(SubscriptionUsage)
        .where(col(SubscriptionUsage.user_id) == user_id)
        .where(col(SubscriptionUsage.feature) == feature)
        .where(col(SubscriptionUsage.period_type) == period_type)
    )
    if period_start is None:
        statement = statement.where(col(SubscriptionUsage.period_start).is_(None))
    else:
        statement = statement.where(col(SubscriptionUsage.period_start) == period_start)
    return statement


def get_usage_record(
    session: Session,
    *,
    user_id: uuid.UUID,
    feature: str,
    period_type: str,
    period_start: datetime | None = None,
    for_update: bool = False,
) -> SubscriptionUsage | None:
    statement = _usage_statement(user_id, feature, period_type, period_start)
    if for_update:
        statement = statement.with_for_update()
    return session.exec(statement).first()


def get_monthly_usage(
    session: Session,
    *,
    user_id: uuid.UUID,
    feature: str,
    now: datetime | None = None,
) -> int:
    period_start, _period_end = get_monthly_period(now)
    record = get_usage_record(
        session,
        user_id=user_id,
        feature=feature,
        period_type="monthly",
        period_start=period_start,
    )
    return record.usage_count if record else 0


def get_last_used_at(
    session: Session,
    *,
    user_id: uuid.UUID,
    feature: str,
) -> datetime | None:
    record = get_usage_record(
        session,
        user_id=user_id,
        feature=feature,
        period_type="cooldown",
        period_start=None,
    )
    if record and record.last_used_at:
        return _ensure_aware(record.last_used_at)
    return None


def increment_usage(
    session: Session,
    *,
    user_id: uuid.UUID,
    feature: str,
    amount: int = 1,
    now: datetime | None = None,
) -> SubscriptionUsage:
    period_start, period_end = get_monthly_period(now)
    current = _ensure_aware(now or _now_utc())
    record = get_usage_record(
        session,
        user_id=user_id,
        feature=feature,
        period_type="monthly",
        period_start=period_start,
        for_update=True,
    )
    if record:
        record.usage_count += amount
        record.last_used_at = current
        record.updated_at = current
    else:
        record = SubscriptionUsage(
            user_id=user_id,
            feature=feature,
            period_type="monthly",
            period_start=period_start,
            period_end=period_end,
            usage_count=amount,
            last_used_at=current,
            created_at=current,
            updated_at=current,
        )
    session.add(record)
    return record


def record_usage(
    session: Session,
    *,
    user_id: uuid.UUID,
    feature: str,
    now: datetime | None = None,
) -> SubscriptionUsage:
    current = _ensure_aware(now or _now_utc())
    limit_type = FEATURE_LIMIT_TYPES.get(feature)
    if limit_type == "monthly":
        return increment_usage(session, user_id=user_id, feature=feature, now=current)
    if limit_type != "cooldown":
        raise ValueError(f"Feature {feature!r} is not a usage quota")

    record = get_usage_record(
        session,
        user_id=user_id,
        feature=feature,
        period_type="cooldown",
        period_start=None,
        for_update=True,
    )
    if record:
        record.usage_count += 1
        record.last_used_at = current
        record.updated_at = current
    else:
        record = SubscriptionUsage(
            user_id=user_id,
            feature=feature,
            period_type="cooldown",
            usage_count=1,
            last_used_at=current,
            created_at=current,
            updated_at=current,
        )
    session.add(record)
    return record


def _current_plan(session: Session, user: User) -> str:
    subscription = get_current_subscription(session, user.id)
    return get_effective_plan(subscription=subscription)


def record_entitled_usage(
    session: Session,
    user: User,
    feature: str,
    *,
    now: datetime | None = None,
) -> SubscriptionUsage | None:
    """Record successful usage while enforcing the active quota under lock.

    This is intended for the post-success side of a quota-gated operation.
    Routes should still pre-check before doing expensive work, then call this
    before committing the successful operation.
    """
    plan = _current_plan(session, user)
    limit = PLAN_LIMITS.get(plan, {}).get(feature)
    limit_type = FEATURE_LIMIT_TYPES.get(feature)
    current = _ensure_aware(now or _now_utc())

    if limit is None:
        return None

    if limit_type == "monthly":
        period_start, period_end = get_monthly_period(current)
        record = get_usage_record(
            session,
            user_id=user.id,
            feature=feature,
            period_type="monthly",
            period_start=period_start,
            for_update=True,
        )
        current_usage = record.usage_count if record else 0
        if current_usage >= limit:
            raise LimitReachedException(
                feature=feature,
                plan=plan,
                limit=limit,
                current_usage=current_usage,
                next_plan=UPGRADE_PATH.get(plan),
                limit_type="monthly",
            )
        if record:
            record.usage_count += 1
            record.last_used_at = current
            record.updated_at = current
        else:
            record = SubscriptionUsage(
                user_id=user.id,
                feature=feature,
                period_type="monthly",
                period_start=period_start,
                period_end=period_end,
                usage_count=1,
                last_used_at=current,
                created_at=current,
                updated_at=current,
            )
        session.add(record)
        return record

    if limit_type == "cooldown":
        record = get_usage_record(
            session,
            user_id=user.id,
            feature=feature,
            period_type="cooldown",
            period_start=None,
            for_update=True,
        )
        last_used_at = _ensure_aware(record.last_used_at) if record and record.last_used_at else None
        retry_at = last_used_at + AI_SUMMARY_COOLDOWN if last_used_at else None
        if retry_at and current < retry_at:
            raise LimitReachedException(
                feature=feature,
                plan=plan,
                limit=limit,
                current_usage=1,
                next_plan=UPGRADE_PATH.get(plan),
                limit_type="cooldown",
                retry_at=retry_at,
            )
        if record:
            record.usage_count += 1
            record.last_used_at = current
            record.updated_at = current
        else:
            record = SubscriptionUsage(
                user_id=user.id,
                feature=feature,
                period_type="cooldown",
                usage_count=1,
                last_used_at=current,
                created_at=current,
                updated_at=current,
            )
        session.add(record)
        return record

    raise ValueError(f"Feature {feature!r} is not a usage quota")


# ---------------------------------------------------------------------------
# Usage dispatcher
# ---------------------------------------------------------------------------

def _get_current_usage(
    session: Session,
    user: User,
    feature: str,
    *,
    company_id: uuid.UUID | None = None,
) -> int:
    """Return the current usage count for the given feature.

    Args:
        session:    Active database session.
        user:       The authenticated user (used for company-based features).
        feature:    The entitlement feature key.
        company_id: Required for features scoped to a company
                    (``staff``, ``products``, ``customers``).
    """
    limit_type = FEATURE_LIMIT_TYPES.get(feature)
    if limit_type == "monthly":
        return get_monthly_usage(session, user_id=user.id, feature=feature)

    if limit_type == "cooldown":
        return 1 if get_last_used_at(session, user_id=user.id, feature=feature) else 0

    if limit_type == "feature_access":
        return 0

    if feature == "companies":
        return get_company_count(user, session=session)

    if feature == "staff":
        if company_id is None:
            raise ValueError("company_id is required for the 'staff' feature")
        return get_staff_count(session, company_id)

    if feature == "products":
        effective_company_id = company_id or user.company_id
        if effective_company_id is None:
            return 0
        return get_product_count(session, effective_company_id)

    if feature == "customers":
        effective_company_id = company_id or user.company_id
        if effective_company_id is None:
            return 0
        return get_client_count(session, effective_company_id)

    raise ValueError(f"Unknown entitlement feature: {feature!r}")


# ---------------------------------------------------------------------------
# Entitlement status & creation check
# ---------------------------------------------------------------------------

def get_entitlement_status(
    session: Session,
    user: User,
    feature: str,
    *,
    company_id: uuid.UUID | None = None,
) -> EntitlementStatus:
    """Return structured entitlement status for ``user`` and ``feature``.

    Calculates current usage, whether the user is over their plan limit,
    and whether creating an additional resource is permitted.
    Does NOT raise an exception if over limit.

    Args:
        session:    Active database session.
        user:       The authenticated user.
        feature:    The entitlement feature key (e.g. ``"companies"``).
        company_id: Company scope for per-company features.

    Returns:
        EntitlementStatus object.

    Raises:
        ValueError: When the feature key is unknown.
    """
    plan = _current_plan(session, user)

    plan_limits = PLAN_LIMITS.get(plan, {})
    if feature not in plan_limits:
        raise ValueError(f"Unknown entitlement feature: {feature!r}")

    limit_type = FEATURE_LIMIT_TYPES.get(feature, "resource")
    limit = plan_limits.get(feature)
    current_usage = _get_current_usage(session, user, feature, company_id=company_id)
    retry_at: datetime | None = None

    if limit is None:
        over_limit = False
        can_create = True
    elif limit_type == "cooldown":
        last_used_at = get_last_used_at(session, user_id=user.id, feature=feature)
        if last_used_at is None:
            over_limit = False
            can_create = True
            current_usage = 0
        else:
            retry_at = last_used_at + AI_SUMMARY_COOLDOWN
            can_create = _now_utc() >= retry_at
            over_limit = not can_create
            current_usage = 0 if can_create else 1
    else:
        over_limit = current_usage > limit
        can_create = current_usage < limit

    return EntitlementStatus(
        feature=feature,
        plan=plan,
        limit=limit,
        current_usage=current_usage,
        over_limit=over_limit,
        can_create=can_create,
        limit_type=limit_type,
        retry_at=retry_at,
    )


def check_entitlement(
    session: Session,
    user: User,
    feature: str,
    *,
    company_id: uuid.UUID | None = None,
) -> None:
    """Check whether ``user`` is allowed to create a resource gated by ``feature``.

    Raises ``LimitReachedException`` if creation is not allowed (``can_create`` is False).
    Returns ``None`` (implicitly) if creation is allowed.

    Args:
        session:    Active database session.
        user:       The authenticated user.
        feature:    The entitlement feature key (e.g. ``"companies"``).
        company_id: Company scope for per-company features
                    (``staff``, ``products``, ``customers``).

    Raises:
        LimitReachedException: When ``can_create`` is False.
        ValueError: When the feature key is unknown.
    """
    status = get_entitlement_status(session, user, feature, company_id=company_id)

    if not status.can_create:
        assert status.limit is not None
        raise LimitReachedException(
            feature=status.feature,
            plan=status.plan,
            limit=status.limit,
            current_usage=status.current_usage,
            next_plan=UPGRADE_PATH.get(status.plan),
            limit_type=status.limit_type,
            retry_at=status.retry_at,
        )


def limit_reached_detail(exc: LimitReachedException) -> dict[str, object]:
    """Return the standardized LIMIT_REACHED response body."""
    detail: dict[str, object] = {
        "error": "LIMIT_REACHED",
        "feature": exc.feature,
        "plan": exc.plan,
        "limit": exc.limit,
        "current_usage": exc.current_usage,
        "upgrade_required": True,
        "next_plan": exc.next_plan,
    }
    if exc.limit_type != "resource":
        detail["limit_type"] = exc.limit_type
    if exc.retry_at is not None:
        detail["retry_at"] = exc.retry_at.isoformat().replace("+00:00", "Z")
    return detail
