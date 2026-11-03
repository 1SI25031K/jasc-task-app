"""F17：依頼の受信箱画面。自分への依頼を一覧表示し、「承諾」「相談したい（コメント必須）」を操作できる。"""

from __future__ import annotations

import streamlit as st

from core.assignments import accept_assignment, consult_assignment
from core.i18n import format_date, t, translate_weight
from core.models import InvalidAssignmentTransitionError, OptimisticLockError
from core.session import (
    get_current_member,
    get_lang,
    get_now,
    get_repo,
    render_task_card,
)

repo = get_repo()
lang = get_lang()
now = get_now()
current_member = get_current_member()

roles = repo.list_roles(active_only=True)
members = repo.list_members(active_only=True)
all_tasks = repo.list_tasks(include_archived=False)
checkins = repo.list_checkins()

role_map = {r.role_id: r for r in roles}
member_map = {m.member_id: m for m in members}

st.title(f"📬 {t('inbox.title', lang)}（{current_member.get_name(lang)}）")
st.caption(t("inbox.subtitle", lang))

pending_requests = sorted(
    (
        task
        for task in all_tasks
        if task.owner_member_id == current_member.member_id
        and task.assignment_status == "依頼中"
        and task.status != "完了"
    ),
    key=lambda x: (x.na_due, x.task_id),
)

if not pending_requests:
    st.success(t("inbox.empty_inbox", lang))
else:
    for task in pending_requests:
        requester = member_map.get(task.requested_by)
        req_name = (
            requester.get_name(lang)
            if requester
            else (task.requested_by or t("common.none", lang))
        )
        role_names = " / ".join(
            role_map[rid].get_name(lang)
            for rid in task.role_ids
            if rid in role_map
        )
        weight_label = translate_weight(task.weight, lang)

        with st.container(border=True):
            st.markdown(f"#### 📩 {task.title}")
            st.caption(
                f"**{t('common.requested_by', lang)}**: {req_name} ｜ "
                f"**{t('common.role', lang)}**: {role_names} ｜ "
                f"**{t('common.weight', lang)}**: {weight_label} ｜ "
                f"**{t('common.due_date', lang)}**: {format_date(task.na_due, lang)}"
            )
            st.markdown(
                f"👉 **{t('common.next_action', lang)}**: {task.next_action}"
            )

            col_acc, col_con = st.columns([1, 2])
            with col_acc:
                st.write("")
                if st.button(
                    t("inbox.accept_btn", lang),
                    key=f"inbox_acc_{task.task_id}",
                    type="primary",
                    use_container_width=True,
                ):
                    try:
                        updated_t, log = accept_assignment(
                            task=task,
                            actor_member_id=current_member.member_id,
                            now=now,
                        )
                        repo.update_task(
                            updated_t, expected_updated_at=task.updated_at
                        )
                        repo.add_activity_log(log)
                        st.toast(t("inbox.accepted_toast", lang))
                        st.rerun()
                    except (
                        InvalidAssignmentTransitionError,
                        OptimisticLockError,
                    ) as e:
                        st.error(str(e))

            with col_con:
                comment_val = st.text_input(
                    t("inbox.consult_comment_label", lang),
                    key=f"inbox_cmt_{task.task_id}",
                )
                if st.button(
                    t("inbox.consult_btn", lang),
                    key=f"inbox_con_{task.task_id}",
                    use_container_width=True,
                ):
                    if not comment_val.strip():
                        st.error(t("inbox.consult_comment_required", lang))
                    else:
                        try:
                            updated_t, log = consult_assignment(
                                task=task,
                                actor_member_id=current_member.member_id,
                                comment=comment_val,
                                now=now,
                            )
                            repo.update_task(
                                updated_t, expected_updated_at=task.updated_at
                            )
                            repo.add_activity_log(log)
                            st.toast(t("inbox.consulted_toast", lang))
                            st.rerun()
                        except (
                            InvalidAssignmentTransitionError,
                            OptimisticLockError,
                        ) as e:
                            st.error(str(e))

# 現在「相談中」のタスク一覧（自分が担当または自分が依頼元のもの）
consulting_tasks = [
    task
    for task in all_tasks
    if task.assignment_status == "相談中"
    and (
        task.owner_member_id == current_member.member_id
        or task.requested_by == current_member.member_id
    )
]
if consulting_tasks:
    st.divider()
    st.subheader(f"💬 {t('inbox.consulting_section', lang)} ({len(consulting_tasks)})")
    for task in consulting_tasks:
        render_task_card(
            task, roles, members, checkins, all_tasks, "inbox_consulting"
        )
