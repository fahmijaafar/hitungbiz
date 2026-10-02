from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlmodel import Session

from app.models import SubscriptionUsage, User
from app.services.entitlement_service import (
    LimitReachedException,
    check_entitlement,
    get_entitlement_status,
    get_last_used_at,
    get_monthly_period,
    get_monthly_usage,
    record_usage,
)
from app.services.subscription_service import activate_subscription


def _user() -> User:
    return User(
        id=uuid.uuid4(),
        email=f"{uuid.uuid4()}@test.com",
        hashed_password="hashed",
        is_active=True,
        email_verified=True,
    )


def _set_plan(db: Session, user: User, plan: str) -> None:
    db.add(user)
    db.commit()
    billing_period = None if plan == "personal" else "monthly"
    activate_subscription(db, user_id=user.id, plan=plan, billing_period=billing_period)
    db.commit()


def _set_monthly_usage(
    db: Session,
    user: User,
    feature: str,
    count: int,
    now: datetime | None = None,
) -> None:
    period_start, period_end = get_monthly_period(now)
    db.add(
        SubscriptionUsage(
            user_id=user.id,
            feature=feature,
            period_type="monthly",
            period_start=period_start,
            period_end=period_end,
            usage_count=count,
        )
    )
    db.commit()


def _set_cooldown_usage(db: Session, user: User, feature: str, last_used_at: datetime) -> None:
    db.add(
        SubscriptionUsage(
            user_id=user.id,
            feature=feature,
            period_type="cooldown",
            usage_count=1,
            last_used_at=last_used_at,
        )
    )
    db.commit()


def test_monthly_period_uses_utc_calendar_month() -> None:
    start, end = get_monthly_period(datetime(2026, 8, 10, 14, 30, tzinfo=timezone.utc))
    assert start == datetime(2026, 8, 1, tzinfo=timezone.utc)
    assert end == datetime(2026, 9, 1, tzinfo=timezone.utc)


def test_record_usage_creates_and_increments_monthly_usage(db: Session) -> None:
    user = _user()
    _set_plan(db, user, "personal")

    record_usage(db, user_id=user.id, feature="documents")
    record_usage(db, user_id=user.id, feature="documents")
    db.commit()

    assert get_monthly_usage(db, user_id=user.id, feature="documents") == 2


def test_new_month_starts_at_zero_usage(db: Session) -> None:
    user = _user()
    _set_plan(db, user, "personal")
    _set_monthly_usage(
        db,
        user,
        "ocr",
        10,
        datetime(2026, 8, 15, tzinfo=timezone.utc),
    )

    september = datetime(2026, 9, 1, tzinfo=timezone.utc)
    assert get_monthly_usage(db, user_id=user.id, feature="ocr", now=september) == 0


@pytest.mark.parametrize(
    ("plan", "feature", "usage", "allowed"),
    [
        ("personal", "documents", 19, True),
        ("personal", "documents", 20, False),
        ("pro", "documents", 1999, True),
        ("pro", "documents", 2000, False),
        ("max", "documents", 5000, True),
        ("personal", "ocr", 9, True),
        ("personal", "ocr", 10, False),
        ("pro", "ocr", 499, True),
        ("pro", "ocr", 500, False),
        ("max", "ocr", 5000, True),
    ],
)
def test_monthly_quota_boundaries(
    db: Session,
    plan: str,
    feature: str,
    usage: int,
    allowed: bool,
) -> None:
    user = _user()
    _set_plan(db, user, plan)
    _set_monthly_usage(db, user, feature, usage)

    if allowed:
        check_entitlement(db, user, feature)
    else:
        with pytest.raises(LimitReachedException):
            check_entitlement(db, user, feature)


def test_ai_summary_records_last_used_at(db: Session) -> None:
    user = _user()
    _set_plan(db, user, "personal")
    now = datetime(2026, 8, 10, 14, 0, tzinfo=timezone.utc)

    record_usage(db, user_id=user.id, feature="ai_summary", now=now)
    db.commit()

    assert get_last_used_at(db, user_id=user.id, feature="ai_summary") == now


def test_ai_summary_cooldown_denies_before_24_hours(db: Session) -> None:
    user = _user()
    _set_plan(db, user, "personal")
    last_used = datetime.now(timezone.utc) - timedelta(hours=23, minutes=59)
    _set_cooldown_usage(db, user, "ai_summary", last_used)

    with pytest.raises(LimitReachedException) as exc_info:
        check_entitlement(db, user, "ai_summary")

    assert exc_info.value.retry_at == last_used + timedelta(hours=24)
    assert exc_info.value.limit_type == "cooldown"


def test_ai_summary_cooldown_allows_after_24_hours(db: Session) -> None:
    user = _user()
    _set_plan(db, user, "personal")
    _set_cooldown_usage(
        db,
        user,
        "ai_summary",
        datetime.now(timezone.utc) - timedelta(hours=24, minutes=1),
    )

    check_entitlement(db, user, "ai_summary")


@pytest.mark.parametrize("plan", ["pro", "max"])
def test_ai_summary_unlimited_for_paid_plans(db: Session, plan: str) -> None:
    user = _user()
    _set_plan(db, user, plan)
    _set_cooldown_usage(db, user, "ai_summary", datetime.now(timezone.utc))

    status = get_entitlement_status(db, user, "ai_summary")

    assert status.limit is None
    assert status.can_create is True
