"""5.3 依頼と承諾・相談の状態遷移ロジック。"""

from __future__ import annotations

from dataclasses import replace
from datetime import datetime

from core.models import (
    ActivityLog,
    AssignmentStatus,
    InvalidAssignmentTransitionError,
    Task,
)


def determine_initial_assignment(
    creator_member_id: str, owner_member_id: str
) -> tuple[AssignmentStatus, str]:
    """タスク作成時の assignment_status と requested_by を決定する（5.3）。

    - 自分を担当者にした場合：('承諾済', '')
    - 自分以外を担当者にした場合：('依頼中', creator_member_id)
    """
    if not creator_member_id or not owner_member_id:
        raise InvalidAssignmentTransitionError(
            "作成者IDと担当者IDは必須です。"
        )
    if creator_member_id == owner_member_id:
        return "承諾済", ""
    return "依頼中", creator_member_id


def accept_assignment(
    task: Task, actor_member_id: str, now: datetime
) -> tuple[Task, ActivityLog]:
    """依頼中のタスクを担当者本人が「承諾」する（5.3）。

    違反時（担当者本人以外が実行、または現在が「依頼中」でない、アーカイブ済）は
    InvalidAssignmentTransitionError を送出する。
    """
    if task.archived:
        raise InvalidAssignmentTransitionError(
            "アーカイブされたタスクの依頼は承諾できません。"
        )
    if actor_member_id != task.owner_member_id:
        raise InvalidAssignmentTransitionError(
            "担当者本人以外は依頼を承諾できません。"
        )
    if task.assignment_status != "依頼中":
        raise InvalidAssignmentTransitionError(
            f"現在の状態が「{task.assignment_status}」のため承諾できません（「依頼中」のみ承諾可能）。"
        )

    old_status = task.assignment_status
    updated_task = replace(
        task,
        assignment_status="承諾済",
        assignment_comment="",
        updated_at=now,
        updated_by=actor_member_id,
    )
    log = ActivityLog(
        timestamp=now,
        member_id=actor_member_id,
        task_id=task.task_id,
        action="accept",
        field="assignment_status",
        old_value=old_status,
        new_value="承諾済",
    )
    return updated_task, log


def consult_assignment(
    task: Task, actor_member_id: str, comment: str, now: datetime
) -> tuple[Task, ActivityLog]:
    """依頼中のタスクについて担当者本人が「相談したい」（コメント必須）を選ぶ（5.3）。

    違反時（担当者本人以外、現在が「依頼中」でない、コメントが空、アーカイブ済）は
    InvalidAssignmentTransitionError を送出する。
    """
    if task.archived:
        raise InvalidAssignmentTransitionError(
            "アーカイブされたタスクは相談中に変更できません。"
        )
    if actor_member_id != task.owner_member_id:
        raise InvalidAssignmentTransitionError(
            "担当者本人以外は「相談したい」を選択できません。"
        )
    if task.assignment_status != "依頼中":
        raise InvalidAssignmentTransitionError(
            f"現在の状態が「{task.assignment_status}」のため相談中に変更できません（「依頼中」のみ可能）。"
        )
    clean_comment = comment.strip()
    if not clean_comment:
        raise InvalidAssignmentTransitionError(
            "「相談したい」を選択する場合はコメントが必須です。"
        )

    old_status = task.assignment_status
    updated_task = replace(
        task,
        assignment_status="相談中",
        assignment_comment=clean_comment,
        updated_at=now,
        updated_by=actor_member_id,
    )
    log = ActivityLog(
        timestamp=now,
        member_id=actor_member_id,
        task_id=task.task_id,
        action="consult",
        field="assignment_status",
        old_value=old_status,
        new_value="相談中",
    )
    return updated_task, log


def reassign_or_rerequest(
    task: Task,
    new_owner_member_id: str,
    actor_member_id: str,
    now: datetime,
) -> tuple[Task, ActivityLog]:
    """担当者の変更、または「相談中」からの内容調整後の再依頼を行う（5.3・F8）。

    - 新しい担当者が操作者自身（new_owner == actor）なら「承諾済」（requested_by=''）になる。
    - 新しい担当者が操作者以外（new_owner != actor）なら「依頼中」（requested_by=actor）になる。
    - 担当者が変わらず、相談中でもない状態での無意味な再依頼はエラーとする。
    """
    if task.archived:
        raise InvalidAssignmentTransitionError(
            "アーカイブされたタスクの担当変更・再依頼はできません。"
        )
    if not new_owner_member_id or not actor_member_id:
        raise InvalidAssignmentTransitionError(
            "新しい担当者IDと操作者IDは必須です。"
        )
    if (
        new_owner_member_id == task.owner_member_id
        and task.assignment_status != "相談中"
    ):
        raise InvalidAssignmentTransitionError(
            "同じ担当者への再依頼は「相談中」の状態からのみ行えます。"
        )

    new_status, new_requested_by = determine_initial_assignment(
        creator_member_id=actor_member_id,
        owner_member_id=new_owner_member_id,
    )
    old_val = f"{task.owner_member_id}({task.assignment_status})"
    new_val = f"{new_owner_member_id}({new_status})"

    updated_task = replace(
        task,
        owner_member_id=new_owner_member_id,
        requested_by=new_requested_by,
        assignment_status=new_status,
        assignment_comment="",
        updated_at=now,
        updated_by=actor_member_id,
    )
    log = ActivityLog(
        timestamp=now,
        member_id=actor_member_id,
        task_id=task.task_id,
        action="request",
        field="owner_member_id",
        old_value=old_val,
        new_value=new_val,
    )
    return updated_task, log

