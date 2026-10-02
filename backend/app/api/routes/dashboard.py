from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Optional

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Query
from sqlmodel import func, select, and_

from app.api.deps import CurrentUser, SessionDep, VerifiedUser
from app.models import DashboardChartData, DashboardSummary, MonthlyDataPoint, Purchase, Sale

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/", response_model=DashboardSummary)
def read_dashboard_summary(
    session: SessionDep, current_user: VerifiedUser
) -> Any:
    """
    Retrieve dashboard summary with total revenue and expenses.
    """
    # Use the current user's company_id
    company_id = current_user.company_id

    # Calculate total revenue from sales (sum of final_amount)
    if company_id:
        revenue_statement = select(func.coalesce(func.sum(Sale.final_amount), 0)).where(
            Sale.company_id == company_id,
            Sale.status == "Completed",
        )
        expenses_statement = select(func.coalesce(func.sum(Purchase.final_amount), 0)).where(
            Purchase.company_id == company_id,
            Purchase.status == "Paid",
        )
    else:
        revenue_statement = select(func.coalesce(func.sum(Sale.final_amount), 0)).where(
            Sale.status == "Completed"
        )
        expenses_statement = select(func.coalesce(func.sum(Purchase.final_amount), 0)).where(
            Purchase.status == "Paid"
        )

    total_revenue = session.exec(revenue_statement).one()
    total_expenses = session.exec(expenses_statement).one()

    return DashboardSummary(
        total_revenue=float(total_revenue),
        total_expenses=float(total_expenses),
    )


@router.get("/chart", response_model=DashboardChartData)
def read_dashboard_chart(
    session: SessionDep,
    current_user: VerifiedUser,
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    period: Optional[str] = Query(
        "last_6_months",
        description="Preset period: this_week, last_7_days, month_to_date, all_time, year_to_date, last_6_months, last_12_months",
    ),
) -> Any:
    """
    Retrieve dashboard chart data (monthly breakdown) with date filtering.
    """
    company_id = current_user.company_id
    now = datetime.now(timezone.utc)

    # Determine date range
    if start_date and end_date:
        try:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d")
            end_dt = datetime.strptime(end_date, "%Y-%m-%d").replace(
                hour=23, minute=59, second=59, microsecond=999999
            )
        except ValueError:
            start_dt = None
            end_dt = None
    elif period == "all_time":
        start_dt = None
        end_dt = None
    elif period == "this_week":
        # Week starts on Monday
        days_since_monday = now.weekday()  # Monday=0, Sunday=6
        start_dt = now.replace(hour=0, minute=0, second=0, microsecond=0) - relativedelta(days=days_since_monday)
        end_dt = (now + relativedelta(days=1)).replace(hour=23, minute=59, second=59, microsecond=999999)
    elif period == "last_7_days":
        start_dt = now - relativedelta(days=7)
        end_dt = (now + relativedelta(days=1)).replace(hour=23, minute=59, second=59, microsecond=999999)
    elif period == "month_to_date":
        start_dt = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        end_dt = (now + relativedelta(days=1)).replace(hour=23, minute=59, second=59, microsecond=999999)
    elif period == "year_to_date":
        start_dt = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        end_dt = (now + relativedelta(days=1)).replace(hour=23, minute=59, second=59, microsecond=999999)
    elif period == "last_12_months":
        start_dt = now - relativedelta(months=12)
        end_dt = (now + relativedelta(days=1)).replace(hour=23, minute=59, second=59, microsecond=999999)
    else:  # last_6_months (default)
        start_dt = now - relativedelta(months=6)
        end_dt = (now + relativedelta(days=1)).replace(hour=23, minute=59, second=59, microsecond=999999)

    # Build base queries with date filters
    sale_conditions = []
    purchase_conditions = []

    sale_conditions.append(Sale.status == "Completed")
    purchase_conditions.append(Purchase.status == "Paid")

    if company_id:
        sale_conditions.append(Sale.company_id == company_id)
        purchase_conditions.append(Purchase.company_id == company_id)

    if start_dt and end_dt:
        # Sale.date is a date (not datetime), Purchase.date is datetime
        sale_conditions.append(Sale.date >= start_dt.date())
        sale_conditions.append(Sale.date <= end_dt.date())
        purchase_conditions.append(Purchase.date >= start_dt)
        purchase_conditions.append(Purchase.date <= end_dt)

    # Get sales data
    if sale_conditions:
        sales_query = select(Sale).where(and_(*sale_conditions))
    else:
        sales_query = select(Sale)
    sales_rows = session.exec(sales_query).all()

    # Get purchases data
    if purchase_conditions:
        purchase_query = select(Purchase).where(and_(*purchase_conditions))
    else:
        purchase_query = select(Purchase)
    purchase_rows = session.exec(purchase_query).all()

    # Determine if short-term period (use daily granularity, not monthly)
    short_term_periods = {"this_week", "last_7_days", "month_to_date"}
    use_daily = period in short_term_periods

    # Compute totals (for summary cards)
    total_revenue = sum(float(row.final_amount) for row in sales_rows)
    total_expenses = sum(float(row.final_amount) for row in purchase_rows)

    # Aggregate by month or day
    sale_buckets: dict[str, float] = defaultdict(float)
    for row in sales_rows:
        key = row.date.strftime("%Y-%m-%d" if use_daily else "%Y-%m")
        sale_buckets[key] += float(row.final_amount)

    purchase_buckets: dict[str, float] = defaultdict(float)
    for row in purchase_rows:
        key = row.date.strftime("%Y-%m-%d" if use_daily else "%Y-%m")
        purchase_buckets[key] += float(row.final_amount)

    # Build sorted list of keys covering the full date range (always include zero values)
    if start_dt and end_dt:
        if use_daily:
            # Generate daily keys from start to end (inclusive)
            sorted_keys = []
            current = start_dt.replace(hour=0, minute=0, second=0, microsecond=0)
            end_day = end_dt.replace(hour=0, minute=0, second=0, microsecond=0)
            while current <= end_day:
                sorted_keys.append(current.strftime("%Y-%m-%d"))
                current += relativedelta(days=1)
        else:
            # Align to first of the month to include current month fully
            month_start = start_dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            month_end = end_dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            sorted_keys = []
            current = month_start
            while current <= month_end:
                sorted_keys.append(current.strftime("%Y-%m"))
                current += relativedelta(months=1)
    else:
        # No date range (all_time) -> use data keys only
        all_keys_set = set(sale_buckets.keys()) | set(purchase_buckets.keys())
        sorted_keys = sorted(all_keys_set)

    sales_overview = [
        MonthlyDataPoint(month=k, total=round(sale_buckets.get(k, 0), 2))
        for k in sorted_keys
    ]
    purchases_overview = [
        MonthlyDataPoint(month=k, total=round(purchase_buckets.get(k, 0), 2))
        for k in sorted_keys
    ]

    return DashboardChartData(
        sales_overview=sales_overview,
        purchases_overview=purchases_overview,
        total_revenue=round(total_revenue, 2),
        total_expenses=round(total_expenses, 2),
    )
