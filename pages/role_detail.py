"""F3：役職詳細画面。役職の未完了タスク（NA期限順）、完了タスク、担当メンバーの負荷、完了率を表示する。"""

from __future__ import annotations

import streamlit as st

from core.i18n import t, translate_assignment_kind
from core.load import calc_member_auto_load, get_latest_checkin
from core.services import calc_completion_rate, format_completion_rate
from core.session import (
    format_subjective_score_badge,
    get_lang,
    get_repo,
    get_today,
    open_create_task_dialog,
    render_task_card,
)

repo = get_repo()
lang = get_lang()
today = get_today()

roles = repo.list_roles(active_only=True)
members = repo.list_members(active_only=True)
role_assignments = repo.list_role_assignments()
all_tasks = repo.list_tasks(include_archived=False)
checkins = repo.list_checkins()
settings = repo.get_settings()

role_map = {r.role_id: r for r in roles}
member_map = {m.member_id: m for m in members}
role_ids = [r.role_id for r in roles]

default_rid = st.session_state.get("selected_role_id", role_ids[0] if role_ids else "")
default_idx = role_ids.index(default_rid) if default_rid in role_ids else 0

hdr_col1, hdr_col2 = st.columns([3, 1])
with hdr_col1:
    st.title(f"📂 {t('role_detail.title', lang)}")
with hdr_col2:
    selected_role_id = st.selectbox(
        t("role_detail.select_role", lang),
        options=role_ids,
        index=default_idx,
        format_func=lambda rid: role_map[rid].get_name(lang),
        key="role_detail_select",
    )
    st.session_state["selected_role_id"] = selected_role_id

selected_role = role_map[selected_role_id]
role_tasks = [t for t in all_tasks if selected_role_id in t.role_ids]
open_tasks = sorted(
    (t for t in role_tasks if t.status != "完了"),
    key=lambda t: (t.na_due, t.task_id),
)
done_tasks = sorted(
    (t for t in role_tasks if t.status == "完了"),
    key=lambda t: (t.na_due, t.task_id),
    reverse=True,
)

# 上部：完了率プログレスバーと担当メンバー一覧（負荷つき）
top_col1, top_col2 = st.columns([1.2, 1.8])
with top_col1:
    with st.container(border=True):
        rate = calc_completion_rate(role_tasks)
        rate_str = format_completion_rate(rate)
        st.metric(
            label=f"{selected_role.get_name(lang)} — {t('role_detail.completion_rate', lang)}",
            value=rate_str,
            help=t(
                "role_detail.completion_detail",
                lang,
                done=len(done_tasks),
                total=len(role_tasks),
            ),
        )
        st.progress(rate if rate is not None else 0.0)
        st.caption(
            t(
                "role_detail.completion_detail",
                lang,
                done=len(done_tasks),
                total=len(role_tasks),
            )
        )
        if st.button(
            t("role_detail.create_for_role_btn", lang),
            type="primary",
            use_container_width=True,
            key="role_detail_create_btn",
        ):
            open_create_task_dialog(default_role_id=selected_role_id)

with top_col2:
    with st.container(border=True):
        st.markdown(f"**👥 {t('role_detail.assigned_members', lang)}**")
        this_role_assignments = [
            ra for ra in role_assignments if ra.role_id == selected_role_id
        ]
        if not this_role_assignments:
            st.caption(t("role_detail.no_members", lang))
        else:
            for ra in this_role_assignments:
                m = member_map.get(ra.member_id)
                if not m:
                    continue
                kind_label = translate_assignment_kind(ra.kind, lang)
                auto_pt = calc_member_auto_load(
                    m.member_id, all_tasks, today, settings
                )
                latest_c, is_fresh = get_latest_checkin(
                    m.member_id, checkins, today
                )
                subj_badge = format_subjective_score_badge(
                    latest_c.score if latest_c else None, is_fresh, lang
                )
                st.markdown(
                    f"・:blue-badge[{kind_label}] **{m.get_name(lang)}** ｜ "
                    f"{t('common.auto_load_short', lang, pt=auto_pt)} ｜ {subj_badge}"
                )

# 未完了タスク一覧
st.subheader(f"📌 {t('role_detail.open_tasks_section', lang)} ({len(open_tasks)})")
if not open_tasks:
    st.info(t("role_detail.no_open_tasks", lang))
else:
    for task in open_tasks:
        render_task_card(
            task=task,
            roles=roles,
            members=members,
            checkins=checkins,
            all_tasks=all_tasks,
            key_prefix="role_open",
        )

# 完了タスク（折りたたみ）
with st.expander(
    t("role_detail.completed_tasks_expander", lang, count=len(done_tasks))
):
    if not done_tasks:
        st.caption(t("common.none", lang))
    else:
        for task in done_tasks:
            render_task_card(
                task=task,
                roles=roles,
                members=members,
                checkins=checkins,
                all_tasks=all_tasks,
                key_prefix="role_done",
            )

