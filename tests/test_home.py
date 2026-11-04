"""フェーズ7.6-B：ホーム（あいさつ画面・時間帯判定・アバター・サマリー・お知らせ）の単体テスト。"""

from __future__ import annotations

from datetime import date, datetime, time
from zoneinfo import ZoneInfo
import pytest

from core.models import Checkin, Task
from core.services import (
    build_home_summary,
    get_greeting_key,
    get_home_alerts,
)
from core.ui.avatar import AVATAR_COLORS, get_avatar_color, get_initial

JST = ZoneInfo("Asia/Tokyo")


def test_greeting_key_boundary_times() -> None:
    """朝（5:00〜10:59）・昼（11:00〜17:59）・夜（18:00〜4:59）の厳格な境界時刻テスト。"""
    # 4:59 -> 夜（evening）
    assert get_greeting_key(time(4, 59, 59)) == "evening"

    # 5:00 -> 朝（morning）境界
    assert get_greeting_key(time(5, 0, 0)) == "morning"
    assert get_greeting_key(time(8, 30)) == "morning"

    # 10:59 -> 朝（morning）
    assert get_greeting_key(time(10, 59, 59)) == "morning"

    # 11:00 -> 昼（afternoon）境界
    assert get_greeting_key(time(11, 0, 0)) == "afternoon"
    assert get_greeting_key(time(14, 0)) == "afternoon"

    # 17:59 -> 昼（afternoon）
    assert get_greeting_key(time(17, 59, 59)) == "afternoon"

    # 18:00 -> 夜（evening）境界
    assert get_greeting_key(time(18, 0, 0)) == "evening"
    assert get_greeting_key(time(23, 59)) == "evening"
    assert get_greeting_key(time(0, 0, 0)) == "evening"

    # datetime 型を渡しても正しく判定できること
    dt_morning = datetime(2026, 11, 4, 7, 0, tzinfo=JST)
    assert get_greeting_key(dt_morning) == "morning"
    dt_evening = datetime(2026, 11, 4, 21, 30, tzinfo=JST)
    assert get_greeting_key(dt_evening) == "evening"


def test_avatar_initial_and_deterministic_color() -> None:
    """名前から頭文字を抽出し、メンバーIDごとに決定論的にM3カラーが割り当てられること。"""
    assert get_initial("メンバーA") == "メ"
    assert get_initial("Member F") == "M"
    assert get_initial("  taro yamada ") == "T"
    assert get_initial("") == "J"

    color_a = get_avatar_color("m001")
    color_b = get_avatar_color("m002")
    color_a_repeat = get_avatar_color("m001")

    assert color_a in AVATAR_COLORS
    assert color_b in AVATAR_COLORS
    # 同じ member_id は常に同じ色
    assert color_a == color_a_repeat


def test_build_home_summary_ja_and_en() -> None:
    """今週期限・期限切れ・依頼件数の1行サマリーが正しく構築されること。"""
    today = date(2026, 11, 4)
    tasks = [
        Task(
            task_id="t1",
            title="タスク1",
            role_ids=["r_lead"],
            owner_member_id="m001",
            next_action="NA1",
            na_due=date(2026, 11, 2),  # 期限切れ
            created_at=datetime.now(JST),
            created_by="m001",
            updated_at=datetime.now(JST),
            updated_by="m001",
            weight="中",
            task_due=None,
            status="進行中",
            priority="高",
            assignment_status="承諾済",
            requested_by="",
            assignment_comment="",
            waiting_on_member_id="",
            blocker="",
            notes="",
            source="manual",
            meeting_id="",
            archived=False,
        ),
        Task(
            task_id="t2",
            title="タスク2",
            role_ids=["r_lead"],
            owner_member_id="m001",
            next_action="NA2",
            na_due=date(2026, 11, 6),  # 今週期限
            created_at=datetime.now(JST),
            created_by="m001",
            updated_at=datetime.now(JST),
            updated_by="m001",
            weight="重",
            task_due=None,
            status="進行中",
            priority="中",
            assignment_status="承諾済",
            requested_by="",
            assignment_comment="",
            waiting_on_member_id="",
            blocker="",
            notes="",
            source="manual",
            meeting_id="",
            archived=False,
        ),
        Task(
            task_id="t3",
            title="タスク3（依頼）",
            role_ids=["r_lead"],
            owner_member_id="m001",
            next_action="NA3",
            na_due=date(2026, 11, 20),
            created_at=datetime.now(JST),
            created_by="m002",
            updated_at=datetime.now(JST),
            updated_by="m002",
            weight="軽",
            task_due=None,
            status="未着手",
            priority="中",
            assignment_status="依頼中",
            requested_by="m002",  # 他者からの依頼
            assignment_comment="",
            waiting_on_member_id="",
            blocker="",
            notes="",
            source="manual",
            meeting_id="",
            archived=False,
        ),
    ]

    summary_ja = build_home_summary("m001", tasks, today, lang="ja")
    assert "期限を過ぎた NA 1件" in summary_ja
    assert "今週期限の NA 1件" in summary_ja
    assert "あなたへの依頼 1件" in summary_ja

    summary_en = build_home_summary("m001", tasks, today, lang="en")
    assert "1 NA past due" in summary_en
    assert "1 NA due this week" in summary_en
    assert "1 request for you" in summary_en


def test_home_alerts_and_dismiss_session_logic() -> None:
    """依頼・体感負荷未回答・期限切れのアラートカード生成と「後で」非表示の動作確認。"""
    today = date(2026, 11, 4)
    tasks = [
        Task(
            task_id="t1",
            title="依頼されたタスク",
            role_ids=["r_lead"],
            owner_member_id="m001",
            next_action="NA",
            na_due=today,
            created_at=datetime.now(JST),
            created_by="m002",
            updated_at=datetime.now(JST),
            updated_by="m002",
            weight="中",
            task_due=None,
            status="未着手",
            priority="高",
            assignment_status="依頼中",
            requested_by="m002",
            assignment_comment="",
            waiting_on_member_id="",
            blocker="",
            notes="",
            source="manual",
            meeting_id="",
            archived=False,
        ),
    ]
    checkins: list[Checkin] = []  # 本日のチェックインなし

    alerts = get_home_alerts("m001", tasks, checkins, today)
    types = [a.alert_type for a in alerts]
    assert "inbox" in types
    assert "checkin" in types

    # 「後で」で inbox を非表示にした場合
    dismissed = {"inbox"}
    alerts_dismissed = get_home_alerts("m001", tasks, checkins, today, dismissed_types=dismissed)
    types_dismissed = [a.alert_type for a in alerts_dismissed]
    assert "inbox" not in types_dismissed
    assert "checkin" in types_dismissed
