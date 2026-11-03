"""core/load.py（自動負荷・1〜10換算・ずれ判定・体感負荷アラート）の単体テスト。"""

from datetime import date, datetime, timedelta

from core.load import (
    calc_member_auto_load,
    calc_member_auto_load_breakdown,
    check_high_load_alert,
    get_latest_checkin,
    has_load_gap,
    scale_auto_loads_to_10,
)
from core.models import JST, Checkin, RoleAssignment, Task


def _make_task(
    task_id: str,
    owner: str = "m001",
    weight: str = "中",
    na_due: date = date(2026, 11, 3),
    status: str = "進行中",
    assignment_status: str = "承諾済",
    archived: bool = False,
) -> Task:
    """負荷テスト用のタスク生成ヘルパー。"""
    now = datetime(2026, 11, 3, 10, 0, tzinfo=JST)
    return Task(
        task_id=task_id,
        title=f"タスク {task_id}",
        role_ids=["r_chair"],
        owner_member_id=owner,
        next_action="NA",
        na_due=na_due,
        weight=weight,  # type: ignore[arg-type]
        status=status,  # type: ignore[arg-type]
        assignment_status=assignment_status,  # type: ignore[arg-type]
        archived=archived,
        created_at=now,
        created_by="m001",
        updated_at=now,
        updated_by="m001",
    )


def test_auto_load_calculation_weights_and_boundaries() -> None:
    """重さ（軽=1,中=2,重=3）、日付境界（期限切れ・今日・14日後・15日後）、完了・アーカイブ除外、依頼中・相談中を含めることを確認する。"""
    today = date(2026, 11, 3)

    tasks = [
        # 対象になるタスク
        _make_task(
            "t_overdue",
            weight="軽",
            na_due=today - timedelta(days=5),
            assignment_status="承諾済",
        ),  # +1
        _make_task(
            "t_today",
            weight="中",
            na_due=today,
            assignment_status="承諾済",
        ),  # +2
        _make_task(
            "t_day14",
            weight="重",
            na_due=today + timedelta(days=14),
            assignment_status="依頼中",
        ),  # +3（14日後の境界・依頼中も含む）
        _make_task(
            "t_consult",
            weight="中",
            na_due=today + timedelta(days=7),
            assignment_status="相談中",
        ),  # +2（相談中も含む）
        # 対象外になるタスク
        _make_task(
            "t_day15",
            weight="重",
            na_due=today + timedelta(days=15),
        ),  # 0（15日後は窓の外）
        _make_task(
            "t_done",
            weight="重",
            na_due=today,
            status="完了",
        ),  # 0（完了は除外）
        _make_task(
            "t_archived",
            weight="重",
            na_due=today,
            archived=True,
        ),  # 0（アーカイブは除外）
        _make_task(
            "t_other_owner",
            owner="m002",
            weight="重",
            na_due=today,
        ),  # 0（他人のタスクは除外）
    ]

    breakdown = calc_member_auto_load_breakdown("m001", tasks, today)
    assert breakdown.accepted_points == 3  # 1 + 2
    assert breakdown.pending_points == 5  # 3 (依頼中) + 2 (相談中)
    assert breakdown.total_points == 8
    assert calc_member_auto_load("m001", tasks, today) == 8


def test_scale_auto_loads_and_gap_detection() -> None:
    """1〜10への換算と、体感負荷との差が4以上で「ずれ」と判定されることを確認する。"""
    raw_loads = {
        "m001": 10,  # 最大値 -> 10
        "m002": 5,  # 半分 -> 5
        "m003": 0,  # 0pt -> 1
    }
    scaled = scale_auto_loads_to_10(raw_loads)
    assert scaled["m001"] == 10
    assert scaled["m002"] == 5
    assert scaled["m003"] == 1

    # 差が3なら False、差が4以上なら True
    assert has_load_gap(scaled_auto_load=5, subjective_score=8) is False
    assert has_load_gap(scaled_auto_load=5, subjective_score=9) is True
    assert has_load_gap(scaled_auto_load=10, subjective_score=6) is True
    assert has_load_gap(scaled_auto_load=10, subjective_score=None) is False


def test_latest_checkin_freshness_boundary() -> None:
    """最後の回答から6日後までは有効、7日以上経過したら「未回答（is_fresh=False）」になることを確認する。"""
    today = date(2026, 11, 10)
    c_6days = [Checkin("c1", "m001", today - timedelta(days=6), 6)]
    c_7days = [Checkin("c2", "m001", today - timedelta(days=7), 6)]

    latest6, fresh6 = get_latest_checkin("m001", c_6days, today)
    assert latest6 is not None
    assert fresh6 is True

    latest7, fresh7 = get_latest_checkin("m001", c_7days, today)
    assert latest7 is not None
    assert fresh7 is False


def test_high_load_alert_consecutive_check() -> None:
    """体感負荷8以上が2回連続したときのみアラートになり、委員長・副委員長が通知先になることを確認する。"""
    today = date(2026, 11, 10)
    role_assignments = [
        RoleAssignment("r_chair", "m001", "責任者"),
        RoleAssignment("r_vice_chair", "m002", "責任者"),
        RoleAssignment("r_finance", "m003", "責任者"),
    ]

    # ケース1：8 -> 7（直近が7なので連続ではない）
    checkins_not_consecutive = [
        Checkin("c1", "m005", today - timedelta(days=4), 8),
        Checkin("c2", "m005", today - timedelta(days=1), 7),
    ]
    res1 = check_high_load_alert(
        "m005", checkins_not_consecutive, role_assignments
    )
    assert res1.is_alert is False

    # ケース2：7 -> 8 -> 9（直近2回が8と9で8以上が2回連続）
    checkins_consecutive = [
        Checkin("c1", "m005", today - timedelta(days=7), 7),
        Checkin("c2", "m005", today - timedelta(days=4), 8),
        Checkin("c3", "m005", today - timedelta(days=1), 9),
    ]
    res2 = check_high_load_alert(
        "m005", checkins_consecutive, role_assignments
    )
    assert res2.is_alert is True
    assert res2.recent_scores == [8, 9]
    assert res2.notify_leader_ids == ["m001", "m002"]

