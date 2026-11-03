"""5.5 期限・停滞の判定と、役職ボード（F2）用の集計ロジック。"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Iterable

from core.models import Member, Role, RoleAssignment, Task


def is_overdue_na(task: Task, today: date) -> bool:
    """期限切れ NA かどうかを判定する（5.5：status ≠ 完了、未アーカイブ、na_due < 今日）。"""
    if task.archived or task.status == "完了":
        return False
    return task.na_due < today


def is_due_this_week(task: Task, today: date) -> bool:
    """今週期限の NA かどうかを判定する（5.5：status ≠ 完了、未アーカイブ、今日 <= na_due <= 今日+7日）。"""
    if task.archived or task.status == "完了":
        return False
    return today <= task.na_due <= today + timedelta(days=7)


def is_stale_task(
    task: Task, now: datetime, stale_days: int = 7
) -> bool:
    """停滞タスクかどうかを判定する（5.5：status ≠ 完了、未アーカイブ、updated_at が stale_days 日以上前）。"""
    if task.archived or task.status == "完了":
        return False
    return (now - task.updated_at) >= timedelta(days=stale_days)


def calc_completion_rate(tasks: Iterable[Task]) -> float | None:
    """アーカイブを除くタスク群の完了率（0.0〜1.0）を返す。対象が0件なら None を返す（5.5）。"""
    active_tasks = [t for t in tasks if not t.archived]
    total = len(active_tasks)
    if total == 0:
        return None
    done_count = sum(1 for t in active_tasks if t.status == "完了")
    return done_count / total


def format_completion_rate(rate: float | None) -> str:
    """完了率を画面表示用の文字列（例：'75%' または '—'）に整形する。"""
    if rate is None:
        return "—"
    return f"{round(rate * 100)}%"


@dataclass
class RoleBoardSummary:
    """F2 役職ボードの各カードに表示する集計情報。"""

    role: Role
    lead_member: Member | None
    open_task_count: int
    overdue_na_count: int
    due_this_week_na_count: int
    nearest_na_task: Task | None


def build_role_board_summaries(
    roles: Iterable[Role],
    members: Iterable[Member],
    role_assignments: Iterable[RoleAssignment],
    tasks: Iterable[Task],
    today: date,
) -> list[RoleBoardSummary]:
    """active な役職ごとに、責任者・未完了数・期限切れ数・今週期限数・最短期限NAを集計する（F2）。"""
    member_map: dict[str, Member] = {m.member_id: m for m in members}
    lead_by_role: dict[str, Member] = {}
    for assignment in role_assignments:
        if assignment.kind == "責任者" and assignment.member_id in member_map:
            lead_by_role[assignment.role_id] = member_map[assignment.member_id]

    active_tasks = [t for t in tasks if not t.archived]
    active_roles = sorted(
        (r for r in roles if r.active), key=lambda r: r.sort_order
    )

    summaries: list[RoleBoardSummary] = []
    for role in active_roles:
        role_open_tasks = [
            t
            for t in active_tasks
            if role.role_id in t.role_ids and t.status != "完了"
        ]
        overdue_count = sum(
            1 for t in role_open_tasks if is_overdue_na(t, today)
        )
        due_week_count = sum(
            1 for t in role_open_tasks if is_due_this_week(t, today)
        )
        nearest_task = (
            min(role_open_tasks, key=lambda t: (t.na_due, t.task_id))
            if role_open_tasks
            else None
        )
        summaries.append(
            RoleBoardSummary(
                role=role,
                lead_member=lead_by_role.get(role.role_id),
                open_task_count=len(role_open_tasks),
                overdue_na_count=overdue_count,
                due_this_week_na_count=due_week_count,
                nearest_na_task=nearest_task,
            )
        )
    return summaries

