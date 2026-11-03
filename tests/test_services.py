"""core/services.py（期限・停滞判定・完了率・役職ボード集計）の単体テスト。"""

from datetime import date, datetime, time, timedelta

from core.models import JST, Member, Role, RoleAssignment, Task
from core.services import (
    build_role_board_summaries,
    calc_completion_rate,
    format_completion_rate,
    is_due_this_week,
    is_overdue_na,
    is_stale_task,
)


def _make_task(
    task_id: str = "t1",
    na_due: date = date(2026, 11, 3),
    status: str = "進行中",
    archived: bool = False,
    updated_at: datetime | None = None,
    role_ids: list[str] | None = None,
) -> Task:
    """テスト用のタスクを作成するヘルパー。"""
    now = updated_at or datetime(2026, 11, 3, 10, 0, tzinfo=JST)
    return Task(
        task_id=task_id,
        title=f"タスク {task_id}",
        role_ids=role_ids or ["r_finance"],
        owner_member_id="m001",
        next_action="NA内容",
        na_due=na_due,
        status=status,  # type: ignore[arg-type]
        archived=archived,
        created_at=now,
        created_by="m001",
        updated_at=now,
        updated_by="m001",
    )


def test_overdue_and_due_this_week_date_boundaries() -> None:
    """日付の境界（昨日・今日・7日後・8日後）と完了・アーカイブ除外を確認する。"""
    today = date(2026, 11, 3)
    yesterday = today - timedelta(days=1)
    day_7 = today + timedelta(days=7)
    day_8 = today + timedelta(days=8)

    t_yesterday = _make_task("t_y", na_due=yesterday)
    t_today = _make_task("t_0", na_due=today)
    t_day7 = _make_task("t_7", na_due=day_7)
    t_day8 = _make_task("t_8", na_due=day_8)

    # 期限切れ判定：昨日のみ True、今日以降は False
    assert is_overdue_na(t_yesterday, today) is True
    assert is_overdue_na(t_today, today) is False
    assert is_overdue_na(t_day7, today) is False
    assert is_overdue_na(t_day8, today) is False

    # 今週期限判定：今日〜7日後は True、昨日と8日後は False
    assert is_due_this_week(t_yesterday, today) is False
    assert is_due_this_week(t_today, today) is True
    assert is_due_this_week(t_day7, today) is True
    assert is_due_this_week(t_day8, today) is False

    # 完了またはアーカイブ済はどちらも False
    t_done = _make_task("t_done", na_due=yesterday, status="完了")
    t_archived = _make_task("t_arch", na_due=today, archived=True)
    assert is_overdue_na(t_done, today) is False
    assert is_due_this_week(t_done, today) is False
    assert is_overdue_na(t_archived, today) is False
    assert is_due_this_week(t_archived, today) is False


def test_stale_task_boundary() -> None:
    """停滞タスク判定の境界（6日前 vs 7日前）を確認する。"""
    now = datetime(2026, 11, 10, 12, 0, tzinfo=JST)
    t_6days = _make_task("t6", updated_at=now - timedelta(days=6, hours=23))
    t_7days = _make_task("t7", updated_at=now - timedelta(days=7))
    t_done_7days = _make_task(
        "t7_done", status="完了", updated_at=now - timedelta(days=10)
    )

    assert is_stale_task(t_6days, now, stale_days=7) is False
    assert is_stale_task(t_7days, now, stale_days=7) is True
    assert is_stale_task(t_done_7days, now, stale_days=7) is False


def test_completion_rate_and_role_board_summary() -> None:
    """完了率計算（0件のときは None -> '—'）と役職ボード集計を確認する。"""
    today = date(2026, 11, 3)
    assert calc_completion_rate([]) is None
    assert format_completion_rate(None) == "—"

    tasks = [
        _make_task("t1", na_due=today - timedelta(days=1), status="進行中"),
        _make_task("t2", na_due=today + timedelta(days=3), status="未着手"),
        _make_task("t3", na_due=today - timedelta(days=2), status="完了"),
        _make_task("t4", na_due=today, status="進行中", archived=True),
    ]
    rate = calc_completion_rate(tasks)
    assert rate == 1 / 3
    assert format_completion_rate(rate) == "33%"

    roles = [
        Role("r_finance", "財務", "Finance", "主役職", 10, True),
        Role("r_pr", "広報", "PR", "主役職", 20, True),
    ]
    members = [
        Member("m001", "メンバーA", "Member A", "member_a@example.com")
    ]
    assignments = [RoleAssignment("r_finance", "m001", "責任者")]

    summaries = build_role_board_summaries(
        roles=roles,
        members=members,
        role_assignments=assignments,
        tasks=tasks,
        today=today,
    )
    assert len(summaries) == 2
    fin_summary = summaries[0]
    assert fin_summary.role.role_id == "r_finance"
    assert fin_summary.lead_member is not None
    assert fin_summary.lead_member.member_id == "m001"
    assert fin_summary.open_task_count == 2
    assert fin_summary.overdue_na_count == 1
    assert fin_summary.due_this_week_na_count == 1
    assert fin_summary.nearest_na_task is not None
    assert fin_summary.nearest_na_task.task_id == "t1"

