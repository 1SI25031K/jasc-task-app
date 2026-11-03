"""core/assignments.py（依頼・承諾・相談の状態遷移 5.3）の単体テスト。"""

from datetime import date, datetime
import pytest

from core.assignments import (
    accept_assignment,
    consult_assignment,
    determine_initial_assignment,
    reassign_or_rerequest,
)
from core.models import (
    JST,
    InvalidAssignmentTransitionError,
    Task,
)


def _make_requested_task() -> Task:
    """メンバーA(m001)からメンバーB(m002)へ依頼中のタスクを生成する。"""
    now = datetime(2026, 11, 3, 10, 0, tzinfo=JST)
    return Task(
        task_id="t_req",
        title="会場見積の取得",
        role_ids=["r_pre_camp"],
        owner_member_id="m002",
        requested_by="m001",
        assignment_status="依頼中",
        next_action="3施設へ電話する",
        na_due=date(2026, 11, 8),
        created_at=now,
        created_by="m001",
        updated_at=now,
        updated_by="m001",
    )


def test_determine_initial_assignment() -> None:
    """自分宛ては『承諾済』、他人宛ては『依頼中』になることを確認する。"""
    status_self, req_self = determine_initial_assignment("m001", "m001")
    assert status_self == "承諾済"
    assert req_self == ""

    status_other, req_other = determine_initial_assignment("m001", "m002")
    assert status_other == "依頼中"
    assert req_other == "m001"


def test_accept_assignment_success_and_invalid_cases() -> None:
    """本人による承諾が成功し、本人以外や依頼中以外の承諾は例外になることを確認する。"""
    now = datetime(2026, 11, 3, 12, 0, tzinfo=JST)
    task = _make_requested_task()

    # 1. 本人以外（m001 や m003）が承諾しようとするとエラー
    with pytest.raises(InvalidAssignmentTransitionError):
        accept_assignment(task, actor_member_id="m001", now=now)

    # 2. 担当者本人（m002）が承諾すると「承諾済」になる
    accepted_task, log = accept_assignment(
        task, actor_member_id="m002", now=now
    )
    assert accepted_task.assignment_status == "承諾済"
    assert log.action == "accept"
    assert log.old_value == "依頼中"
    assert log.new_value == "承諾済"

    # 3. すでに「承諾済」のタスクを再度承諾しようとするとエラー
    with pytest.raises(InvalidAssignmentTransitionError):
        accept_assignment(accepted_task, actor_member_id="m002", now=now)


def test_consult_assignment_and_rerequest_flow() -> None:
    """依頼 -> 相談（コメント必須） -> 再依頼 -> 承諾の一連の流れと例外ケースを確認する。"""
    now = datetime(2026, 11, 3, 12, 0, tzinfo=JST)
    task = _make_requested_task()

    # 1. コメントが空だとエラー
    with pytest.raises(InvalidAssignmentTransitionError):
        consult_assignment(task, actor_member_id="m002", comment="   ", now=now)

    # 2. 本人以外が相談しようとするとエラー
    with pytest.raises(InvalidAssignmentTransitionError):
        consult_assignment(
            task,
            actor_member_id="m001",
            comment="コメント",
            now=now,
        )

    # 3. 本人がコメント付きで「相談したい」を選択すると「相談中」になる
    consulted_task, log_consult = consult_assignment(
        task,
        actor_member_id="m002",
        comment="期限を3日延ばせるか相談したいです",
        now=now,
    )
    assert consulted_task.assignment_status == "相談中"
    assert (
        consulted_task.assignment_comment == "期限を3日延ばせるか相談したいです"
    )
    assert log_consult.action == "consult"

    # 4. 相談中のまま直接「承諾」はできない（依頼者が再依頼する必要がある）
    with pytest.raises(InvalidAssignmentTransitionError):
        accept_assignment(consulted_task, actor_member_id="m002", now=now)

    # 5. 依頼者（m001）が内容を調整して m002 に再依頼すると「依頼中」に戻りコメントがクリアされる
    rerequested_task, log_req = reassign_or_rerequest(
        consulted_task,
        new_owner_member_id="m002",
        actor_member_id="m001",
        now=now,
    )
    assert rerequested_task.assignment_status == "依頼中"
    assert rerequested_task.requested_by == "m001"
    assert rerequested_task.assignment_comment == ""
    assert log_req.action == "request"

    # 6. 再依頼されたタスクを m002 が承諾できる
    final_task, _ = accept_assignment(
        rerequested_task, actor_member_id="m002", now=now
    )
    assert final_task.assignment_status == "承諾済"

