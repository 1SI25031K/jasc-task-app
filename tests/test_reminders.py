"""core/reminders.py（5.6 リマインド抽出・1人1通へのまとめ・二重送信防止・曜日条件等）の単体テスト。"""

from datetime import date, datetime, timedelta

from core.models import (
    JST,
    Checkin,
    Member,
    ReminderLog,
    RoleAssignment,
    Task,
)
from core.reminders import build_daily_reminder_plan


def _make_member(
    m_id: str,
    slack_id: str = "U001",
    reminders_enabled: bool = True,
) -> Member:
    """テスト用のメンバー生成ヘルパー。"""
    return Member(
        member_id=m_id,
        display_name=f"メンバー{m_id}",
        display_name_en=f"Member {m_id}",
        email=f"{m_id}@example.com",
        slack_user_id=slack_id,
        reminders_enabled=reminders_enabled,
        active=True,
    )


def _make_task(
    task_id: str,
    owner: str,
    na_due: date,
    role_ids: list[str] | None = None,
    status: str = "進行中",
    waiting_on: str = "",
    assignment_status: str = "承諾済",
    updated_at: datetime | None = None,
) -> Task:
    """テスト用のタスク生成ヘルパー。"""
    now = updated_at or datetime(2026, 11, 2, 8, 0, tzinfo=JST)
    return Task(
        task_id=task_id,
        title=f"タスク {task_id}",
        role_ids=role_ids or ["r_finance"],
        owner_member_id=owner,
        next_action=f"NA {task_id}",
        na_due=na_due,
        status=status,  # type: ignore[arg-type]
        waiting_on_member_id=waiting_on,
        assignment_status=assignment_status,  # type: ignore[arg-type]
        created_at=now,
        created_by=owner,
        updated_at=now,
        updated_by=owner,
    )


def test_one_dm_per_person_and_prevent_duplicate_sending() -> None:
    """1人に複数項目のリマインドがあっても1通のダイジェストにまとまり、同日2回目の実行では二重送信されないことを確認する。"""
    # 2026-11-02 は月曜日（checkin 対象、stale 対象）
    monday = date(2026, 11, 2)
    now = datetime(2026, 11, 2, 8, 0, tzinfo=JST)

    m1 = _make_member("m001", slack_id="U001")
    tasks = [
        _make_task("t_today", owner="m001", na_due=monday),
        _make_task("t_tomorrow", owner="m001", na_due=monday + timedelta(days=1)),
        _make_task("t_overdue", owner="m001", na_due=monday - timedelta(days=1)),
    ]

    # 1回目の計画作成：m001 の1人分のダイジェストに4項目（due_today, due_tomorrow, overdue, checkin）がまとまる
    plan_1 = build_daily_reminder_plan(
        now=now,
        members=[m1],
        tasks=tasks,
        checkins=[],
        role_assignments=[],
        reminder_logs=[],
    )
    assert len(plan_1.digests) == 1
    digest = plan_1.digests[0]
    kinds = {item.kind for item in digest.items}
    assert kinds == {"due_today", "due_tomorrow", "overdue", "checkin"}

    # 1回目の送信ログを記録した状態で、同じ日に2回目を実行すると送信対象が0件になる
    plan_2 = build_daily_reminder_plan(
        now=now,
        members=[m1],
        tasks=tasks,
        checkins=[],
        role_assignments=[],
        reminder_logs=digest.logs_to_record,
    )
    assert len(plan_2.digests) == 0


def test_weekday_conditions_and_waiting_every_two_days() -> None:
    """曜日条件（体感負荷＝月水金、停滞＝月曜のみ）と、待ちの2日に1回ルールを確認する。"""
    m1 = _make_member("m001", slack_id="U001")
    m2 = _make_member("m002", slack_id="U002")

    # 2026-11-02（月曜）と 2026-11-03（火曜）
    monday_now = datetime(2026, 11, 2, 8, 0, tzinfo=JST)
    tuesday_now = datetime(2026, 11, 3, 8, 0, tzinfo=JST)

    stale_and_waiting_task = _make_task(
        "t_stale_wait",
        owner="m001",
        na_due=date(2026, 11, 10),
        status="待ち",
        waiting_on="m002",
        updated_at=monday_now - timedelta(days=8),
    )

    # 月曜：m001 に stale と checkin、m002 に waiting と checkin が抽出される
    plan_mon = build_daily_reminder_plan(
        now=monday_now,
        members=[m1, m2],
        tasks=[stale_and_waiting_task],
        checkins=[],
        role_assignments=[],
        reminder_logs=[],
    )
    mon_by_member = {d.member.member_id: d for d in plan_mon.digests}
    assert {i.kind for i in mon_by_member["m001"].items} == {"stale", "checkin"}
    assert {i.kind for i in mon_by_member["m002"].items} == {"waiting", "checkin"}

    # 火曜（前日である月曜に waiting を送信済み）：
    # 火曜なので checkin も stale も出ず、waiting も前日送信済みなのでスキップされ、全員0件になる
    mon_logs = (
        mon_by_member["m001"].logs_to_record
        + mon_by_member["m002"].logs_to_record
    )
    plan_tue = build_daily_reminder_plan(
        now=tuesday_now,
        members=[m1, m2],
        tasks=[stale_and_waiting_task],
        checkins=[],
        role_assignments=[],
        reminder_logs=mon_logs,
    )
    assert len(plan_tue.digests) == 0


def test_overdue_escalation_only_once_per_task() -> None:
    """期限切れエスカレーションは、超過3日以上で役職責任者（本人除く）に最初の1回だけ送られることを確認する。"""
    wed_now = datetime(2026, 11, 4, 8, 0, tzinfo=JST)
    thu_now = datetime(2026, 11, 5, 8, 0, tzinfo=JST)

    leader = _make_member("m_leader", slack_id="U_LEAD")
    owner = _make_member("m_owner", slack_id="U_OWN")
    assignments = [RoleAssignment("r_finance", "m_leader", "責任者")]

    # 3日超過のタスク
    task = _make_task(
        "t_over3",
        owner="m_owner",
        na_due=wed_now.date() - timedelta(days=3),
        role_ids=["r_finance"],
    )

    # 水曜（初回）：責任者 m_leader に overdue_escalation が送られる
    plan_wed = build_daily_reminder_plan(
        now=wed_now,
        members=[leader, owner],
        tasks=[task],
        checkins=[
            Checkin("c1", "m_leader", wed_now.date(), 4),
            Checkin("c2", "m_owner", wed_now.date(), 4),
        ],
        role_assignments=assignments,
        reminder_logs=[],
    )
    wed_by_member = {d.member.member_id: d for d in plan_wed.digests}
    assert "m_leader" in wed_by_member
    assert [i.kind for i in wed_by_member["m_leader"].items] == [
        "overdue_escalation"
    ]

    # 木曜（翌日）：すでに水曜に overdue_escalation を1回送っているので、責任者にはもう送られない
    wed_logs = wed_by_member["m_leader"].logs_to_record
    plan_thu = build_daily_reminder_plan(
        now=thu_now,
        members=[leader, owner],
        tasks=[task],
        checkins=[],
        role_assignments=assignments,
        reminder_logs=wed_logs,
    )
    thu_by_member = {d.member.member_id: d for d in plan_thu.digests}
    assert "m_leader" not in thu_by_member
    # 担当者本人には毎朝の overdue が引き続き送られる
    assert [i.kind for i in thu_by_member["m_owner"].items] == ["overdue"]


def test_reminders_enabled_false_and_empty_slack_id() -> None:
    """reminders_enabled=False の人には high_load_alert 以外送らず、slack_user_id 空の人はスキップ・集計されることを確認する。"""
    mon_now = datetime(2026, 11, 2, 8, 0, tzinfo=JST)
    today = mon_now.date()

    # m_disabled: リマインドOFFだが、体感負荷が2回連続8以上
    m_disabled = _make_member(
        "m_disabled", slack_id="U_DIS", reminders_enabled=False
    )
    # m_no_slack: Slack ID が空
    m_no_slack = _make_member(
        "m_no_slack", slack_id="", reminders_enabled=True
    )

    tasks = [
        _make_task("t1", owner="m_disabled", na_due=today),
        _make_task("t2", owner="m_no_slack", na_due=today),
    ]
    checkins = [
        Checkin("c1", "m_disabled", today - timedelta(days=3), 8),
        Checkin("c2", "m_disabled", today - timedelta(days=1), 9),
    ]

    plan = build_daily_reminder_plan(
        now=mon_now,
        members=[m_disabled, m_no_slack],
        tasks=tasks,
        checkins=checkins,
        role_assignments=[],
        reminder_logs=[],
    )

    # m_no_slack はスキップ一覧に入り、digests には含まれない
    assert [m.member_id for m in plan.skipped_no_slack_id_members] == [
        "m_no_slack"
    ]
    by_member = {d.member.member_id: d for d in plan.digests}
    assert "m_no_slack" not in by_member

    # m_disabled には due_today や checkin は送られず、high_load_alert のみが送られる
    assert "m_disabled" in by_member
    assert [i.kind for i in by_member["m_disabled"].items] == [
        "high_load_alert"
    ]

