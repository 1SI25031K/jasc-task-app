"""4.8 daily_snapshots（進捗グラフ用の日次集計）の生成ロジック。"""

from __future__ import annotations

from datetime import date
from typing import TYPE_CHECKING, Iterable

from core.load import calc_member_auto_load
from core.models import DailySnapshot, Member, Role, Task
from core.services import is_overdue_na
from core.settings import AppSettings

if TYPE_CHECKING:
    from core.repository import Repository


def _build_snapshot_for_tasks(
    target_date: date,
    scope_type: str,
    scope_id: str,
    tasks: Iterable[Task],
    auto_load: int | None = None,
) -> DailySnapshot:
    """対象タスク集合から1行分の DailySnapshot を作成する。"""
    active_tasks = [t for t in tasks if not t.archived]
    total = len(active_tasks)
    done = sum(1 for t in active_tasks if t.status == "完了")
    open_count = total - done
    overdue = sum(1 for t in active_tasks if is_overdue_na(t, target_date))
    completion_rate = (done / total) if total > 0 else 0.0

    return DailySnapshot(
        date=target_date,
        scope_type=scope_type,  # type: ignore[arg-type]
        scope_id=scope_id,
        total=total,
        done=done,
        open=open_count,
        overdue=overdue,
        completion_rate=completion_rate,
        auto_load=auto_load,
    )


def build_daily_snapshots(
    target_date: date,
    tasks: Iterable[Task],
    roles: Iterable[Role],
    members: Iterable[Member],
    settings: AppSettings | None = None,
) -> list[DailySnapshot]:
    """指定日の全体（ALL）・各役職（role）・各メンバー（member）のスナップショット行を生成する（4.8）。"""
    cfg = settings or AppSettings()
    task_list = [t for t in tasks if not t.archived]
    snapshots: list[DailySnapshot] = []

    # 1. ALL（全体）
    snapshots.append(
        _build_snapshot_for_tasks(
            target_date=target_date,
            scope_type="ALL",
            scope_id="",
            tasks=task_list,
            auto_load=None,
        )
    )

    # 2. role（active な各役職）
    active_roles = sorted(
        (r for r in roles if r.active), key=lambda r: r.sort_order
    )
    for role in active_roles:
        role_tasks = [t for t in task_list if role.role_id in t.role_ids]
        snapshots.append(
            _build_snapshot_for_tasks(
                target_date=target_date,
                scope_type="role",
                scope_id=role.role_id,
                tasks=role_tasks,
                auto_load=None,
            )
        )

    # 3. member（active な各メンバー）
    active_members = [m for m in members if m.active]
    for member in active_members:
        member_tasks = [
            t for t in task_list if t.owner_member_id == member.member_id
        ]
        member_load = calc_member_auto_load(
            member_id=member.member_id,
            tasks=task_list,
            today=target_date,
            settings=cfg,
        )
        snapshots.append(
            _build_snapshot_for_tasks(
                target_date=target_date,
                scope_type="member",
                scope_id=member.member_id,
                tasks=member_tasks,
                auto_load=member_load,
            )
        )

    return snapshots


def generate_and_save_daily_snapshots(
    repo: Repository, target_date: date
) -> list[DailySnapshot]:
    """リポジトリから現在のデータを読み取り、指定日のスナップショットを生成して上書き保存する（4.8）。"""
    tasks = repo.list_tasks(include_archived=False)
    roles = repo.list_roles()
    members = repo.list_members()
    settings = repo.get_settings()

    snapshots = build_daily_snapshots(
        target_date=target_date,
        tasks=tasks,
        roles=roles,
        members=members,
        settings=settings,
    )
    repo.save_daily_snapshots(snapshots)
    return snapshots

