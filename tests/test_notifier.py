"""core/notifier.py（F12 毎朝まとめ・F18 個人DM・F19 週次まとめ・Slackエスケープ）の単体テスト。"""

from datetime import date, datetime

from core.models import JST, Member, Role, Task
from core.notifier import (
    DummyNotifier,
    escape_slack_text,
    format_morning_summary,
    format_personal_dm,
    format_weekly_completed_summary,
)
from core.reminders import build_daily_reminder_plan
from core.repository import InMemoryRepository


def test_escape_slack_text_s6() -> None:
    """S6：<, >, & が正しくエスケープされることを確認する。"""
    raw = "A & B <script>alert(1)</script> > C"
    assert (
        escape_slack_text(raw)
        == "A &amp; B &lt;script&gt;alert(1)&lt;/script&gt; &gt; C"
    )


def test_morning_summary_normal_and_zero_cases() -> None:
    """F12：毎朝のまとめ投稿（通常時・0件時の短い一文・Slack ID未設定人数の表示）を確認する。"""
    today = date(2026, 11, 3)
    repo = InMemoryRepository.create_with_dummy_data(today=today)

    # 通常時（ダミーデータには期限切れ・今日期限・Slack未設定1名が含まれる）
    msg_ja = format_morning_summary(
        today=today,
        tasks=repo.list_tasks(),
        members=repo.list_members(),
        roles=repo.list_roles(),
        app_url="https://jasc79.example.com",
        lang="ja",
    )
    assert "【JASC 毎朝の NA まとめ" in msg_ja
    assert "期限を過ぎた NA" in msg_ja
    assert "今日が期限の NA" in msg_ja
    assert "※Slack ID 未設定：1名" in msg_ja

    # 0件の日（日本語・英語）
    msg_zero_ja = format_morning_summary(
        today=today,
        tasks=[],
        members=repo.list_members(),
        roles=repo.list_roles(),
        app_url="https://jasc79.example.com",
        lang="ja",
        missing_slack_id_count=0,
    )
    assert (
        "本日が期限の NA や、期限を過ぎた NA はありません" in msg_zero_ja
    )
    assert "Slack ID 未設定" not in msg_zero_ja

    msg_zero_en = format_morning_summary(
        today=today,
        tasks=[],
        members=repo.list_members(),
        roles=repo.list_roles(),
        app_url="https://jasc79.example.com",
        lang="en",
        missing_slack_id_count=0,
    )
    assert "There are no NAs due today or past their due date" in msg_zero_en


def test_weekly_completed_summary_omits_zero_completed_roles() -> None:
    """F19：週次の完了まとめで、完了0件の役職が一切表示されないことを確認する（日英両方）。"""
    today = date(2026, 11, 3)
    now = datetime(2026, 11, 3, 8, 0, tzinfo=JST)

    roles = [
        Role("r_finance", "財務", "Finance", "主役職", 10, True),
        Role("r_pr", "広報", "Public Relations", "主役職", 20, True),
    ]
    members = [
        Member("m001", "メンバーA", "Member A", "a@example.com"),
    ]
    # 財務のタスクのみ完了、広報は未完了のみ（完了0件）
    tasks = [
        Task(
            task_id="t1",
            title="予算シート集計",
            role_ids=["r_finance"],
            owner_member_id="m001",
            next_action="集計",
            na_due=today,
            status="完了",
            completed_at=now,
            created_at=now,
            created_by="m001",
            updated_at=now,
            updated_by="m001",
        ),
        Task(
            task_id="t2",
            title="SNS投稿作成",
            role_ids=["r_pr"],
            owner_member_id="m001",
            next_action="下書き",
            na_due=today,
            status="進行中",
            created_at=now,
            created_by="m001",
            updated_at=now,
            updated_by="m001",
        ),
    ]

    weekly_ja = format_weekly_completed_summary(
        today=today,
        tasks=tasks,
        members=members,
        roles=roles,
        app_url="https://jasc79.example.com",
        lang="ja",
    )
    assert "*財務（1件）*" in weekly_ja
    assert "広報" not in weekly_ja  # 完了0件の役職は載せない

    weekly_en = format_weekly_completed_summary(
        today=today,
        tasks=tasks,
        members=members,
        roles=roles,
        app_url="https://jasc79.example.com",
        lang="en",
    )
    assert "*Finance (1)*" in weekly_en
    assert "Public Relations" not in weekly_en


def test_personal_dm_ja_and_en_and_dummy_notifier() -> None:
    """F18：個人 DM が日本語・英語の両方で組み立てられ、DummyNotifier に記録されることを確認する。"""
    # 2026-11-02 は月曜
    monday_now = datetime(2026, 11, 2, 8, 0, tzinfo=JST)
    repo = InMemoryRepository.create_with_dummy_data(today=monday_now.date())

    plan = build_daily_reminder_plan(
        now=monday_now,
        members=repo.list_members(),
        tasks=repo.list_tasks(),
        checkins=repo.list_checkins(),
        role_assignments=repo.list_role_assignments(),
        reminder_logs=[],
    )

    notifier = DummyNotifier()
    for digest in plan.digests:
        text = format_personal_dm(
            digest, app_url="https://jasc79.example.com"
        )
        notifier.send_dm(digest.member.slack_user_id, text)

    assert len(notifier.sent_dms) == len(plan.digests)

    # m001（日本語）と m006（英語設定）の文面を確認
    dm_by_slack = {m.target_id: m.text for m in notifier.sent_dms}
    assert "メンバーAさん、おはようございます！" in dm_by_slack["U00000001"]
    assert "https://jasc79.example.com/checkin" in dm_by_slack["U00000001"]
    assert "Good morning, Member F!" in dm_by_slack["U00000006"]

