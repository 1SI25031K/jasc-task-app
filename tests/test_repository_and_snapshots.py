"""core/repository.py と core/snapshots.py、および楽観的ロック（S7）の単体テスト。"""

from dataclasses import replace
from datetime import date, datetime, timedelta
import pytest

from core.load import (
    calc_all_members_auto_load,
    check_high_load_alert,
    get_latest_checkin,
    has_load_gap,
    scale_auto_loads_to_10,
)
from core.models import JST, Checkin, OptimisticLockError
from core.repository import InMemoryRepository
from core.services import is_due_this_week, is_overdue_na, is_stale_task
from core.snapshots import generate_and_save_daily_snapshots


def test_dummy_data_completeness_and_variety() -> None:
    """ダミー初期データ（8名・21役職・30タスク・4週分チェックイン・偏り・各種状態）が要件を満たすことを確認する。"""
    today = date(2026, 11, 3)
    now = datetime(2026, 11, 3, 12, 0, tzinfo=JST)
    repo = InMemoryRepository.create_with_dummy_data(today=today)

    members = repo.list_members()
    roles = repo.list_roles()
    tasks = repo.list_tasks()
    checkins = repo.list_checkins()

    assert len(members) == 8
    assert len(roles) == 21
    assert len(tasks) == 30
    assert len(checkins) == 32  # 8名 × 4回分

    # 各種状態のタスクが含まれていること
    assert any(is_overdue_na(t, today) for t in tasks)
    assert any(is_due_this_week(t, today) for t in tasks)
    assert any(is_stale_task(t, now) for t in tasks)
    assert any(t.status == "完了" for t in tasks)
    assert any(t.status == "待ち" for t in tasks)
    assert any(t.assignment_status == "依頼中" for t in tasks)
    assert any(t.assignment_status == "相談中" for t in tasks)

    # 負荷に偏りがあり、ずれやアラート対象が存在すること
    auto_loads = calc_all_members_auto_load(members, tasks, today)
    assert max(auto_loads.values()) >= 8
    assert min(auto_loads.values()) <= 2

    scaled = scale_auto_loads_to_10(auto_loads)
    # m007 は自動負荷が軽いが最新体感負荷が 8 のため「ずれ」が検出される
    c_m007, fresh_m007 = get_latest_checkin("m007", checkins, today)
    assert fresh_m007 is True
    assert c_m007 is not None
    assert has_load_gap(scaled["m007"], c_m007.score) is True

    # m001 は直近2回が 8, 9 のためアラート対象になる
    alert_m001 = check_high_load_alert(
        "m001", checkins, repo.list_role_assignments()
    )
    assert alert_m001.is_alert is True


def test_optimistic_lock_s7() -> None:
    """S7：updated_at が一致しない場合に OptimisticLockError が送出されることを確認する。"""
    today = date(2026, 11, 3)
    repo = InMemoryRepository.create_with_dummy_data(today=today)
    task = repo.get_task("t001")
    assert task is not None

    original_updated_at = task.updated_at
    new_time_1 = original_updated_at + timedelta(minutes=5)
    new_time_2 = original_updated_at + timedelta(minutes=10)

    # 1人目の保存：expected_updated_at が一致するので成功する
    updated_1 = replace(task, title="更新後のタイトル1", updated_at=new_time_1)
    saved_1 = repo.update_task(
        updated_1, expected_updated_at=original_updated_at
    )
    assert saved_1.title == "更新後のタイトル1"

    # 2人目の保存：古い original_updated_at を渡すと OptimisticLockError になる
    updated_2 = replace(task, title="更新後のタイトル2", updated_at=new_time_2)
    with pytest.raises(OptimisticLockError):
        repo.update_task(updated_2, expected_updated_at=original_updated_at)


def test_checkin_same_day_overwrite() -> None:
    """4.5：同じ人が同じ日に2回答えた場合、新しい回答で上書きされることを確認する。"""
    today = date(2026, 11, 3)
    repo = InMemoryRepository()

    c1 = Checkin("c100", "m001", today, score=5, comment="1回目")
    c2 = Checkin("c101", "m001", today, score=8, comment="2回目（上書き）")

    repo.save_checkin(c1)
    repo.save_checkin(c2)

    checkins = repo.list_checkins(member_id="m001")
    assert len(checkins) == 1
    assert checkins[0].score == 8
    assert checkins[0].comment == "2回目（上書き）"


def test_daily_snapshots_prevent_duplicates() -> None:
    """4.8：スナップショットを同じ日に2回生成・保存しても重複せず上書きされることを確認する。"""
    today = date(2026, 11, 3)
    repo = InMemoryRepository.create_with_dummy_data(today=today)

    # 1回目の生成・保存（ALL 1件 + 役職 21件 + メンバー 8件 = 30件）
    snaps_1 = generate_and_save_daily_snapshots(repo, today)
    assert len(snaps_1) == 30
    assert len(repo.list_daily_snapshots()) == 30

    # タスクを1件完了に変更してから、同じ日付で2回目の生成・保存を実行
    t1 = repo.get_task("t001")
    assert t1 is not None
    repo.update_task(
        replace(
            t1, status="完了", updated_at=t1.updated_at + timedelta(hours=1)
        ),
        expected_updated_at=t1.updated_at,
    )

    snaps_2 = generate_and_save_daily_snapshots(repo, today)
    stored = repo.list_daily_snapshots()

    # 行数は30件のまま（重複しない）で、ALL の done 件数が 1 増えていることを確認
    assert len(snaps_2) == 30
    assert len(stored) == 30

    all_snap_1 = next(s for s in snaps_1 if s.scope_type == "ALL")
    all_snap_2 = next(s for s in stored if s.scope_type == "ALL")
    assert all_snap_2.done == all_snap_1.done + 1

