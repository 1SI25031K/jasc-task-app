"""F6：全タスク一覧画面。役職・担当者・ステータス・依頼状態・キーワード・作成元・アーカイブ状態で絞り込みを行う。"""

from __future__ import annotations

import streamlit as st

from core.i18n import (
    t,
    translate_assignment_status,
    translate_source,
    translate_status,
)
from core.services import filter_tasks
from core.session import (
    ALL_STATUSES,
    get_lang,
    get_repo,
    open_create_task_dialog,
    render_task_card,
)

repo = get_repo()
lang = get_lang()

roles = repo.list_roles(active_only=True)
members = repo.list_members(active_only=True)
all_tasks_including_archived = repo.list_tasks(include_archived=True)
active_tasks = [task for task in all_tasks_including_archived if not task.archived]
checkins = repo.list_checkins()

role_map = {r.role_id: r for r in roles}
member_map = {m.member_id: m for m in members}

hdr_col1, hdr_col2 = st.columns([3, 1])
with hdr_col1:
    st.title(f"📑 {t('all_tasks.title', lang)}")
with hdr_col2:
    if st.button(
        t("app.new_task_btn", lang),
        type="primary",
        use_container_width=True,
        key="all_tasks_new_btn",
    ):
        open_create_task_dialog()

with st.container(border=True):
    f_col1, f_col2, f_col3 = st.columns(3)
    with f_col1:
        f_role = st.selectbox(
            t("all_tasks.filter_role", lang),
            options=[""] + [r.role_id for r in roles],
            format_func=lambda rid: (
                t("common.all", lang) if not rid else role_map[rid].get_name(lang)
            ),
            key="flt_role",
        )
    with f_col2:
        f_owner = st.selectbox(
            t("all_tasks.filter_owner", lang),
            options=[""] + [m.member_id for m in members],
            format_func=lambda mid: (
                t("common.all", lang)
                if not mid
                else member_map[mid].get_name(lang)
            ),
            key="flt_owner",
        )
    with f_col3:
        f_status = st.selectbox(
            t("all_tasks.filter_status", lang),
            options=[""] + list(ALL_STATUSES),
            format_func=lambda s: (
                t("common.all", lang) if not s else translate_status(s, lang)  # type: ignore[arg-type]
            ),
            key="flt_status",
        )

    f_col4, f_col5, f_col6 = st.columns([1, 1, 1.5])
    with f_col4:
        f_assign = st.selectbox(
            t("all_tasks.filter_assignment", lang),
            options=["", "承諾済", "依頼中", "相談中"],
            format_func=lambda a: (
                t("common.all", lang)
                if not a
                else translate_assignment_status(a, lang)  # type: ignore[arg-type]
            ),
            key="flt_assign",
        )
    with f_col5:
        f_source = st.selectbox(
            t("all_tasks.filter_source", lang),
            options=["", "manual", "minutes"],
            format_func=lambda src: (
                t("common.all", lang)
                if not src
                else translate_source(src, lang)  # type: ignore[arg-type]
            ),
            key="flt_source",
        )
    with f_col6:
        f_kw = st.text_input(
            t("all_tasks.filter_keyword", lang), key="flt_kw"
        )

    show_archived = st.checkbox(
        t("all_tasks.filter_show_archived", lang),
        value=False,
        key="flt_archived",
    )

filtered = filter_tasks(
    all_tasks_including_archived,
    role_id=f_role,
    owner_member_id=f_owner,
    status=f_status,
    assignment_status=f_assign,
    source=f_source,
    keyword=f_kw,
    show_archived=show_archived,
)

st.markdown(f"**{t('all_tasks.result_count', lang, count=len(filtered))}**")

if not filtered:
    st.info(t("alerts.empty_section", lang))
else:
    for task in filtered:
        render_task_card(
            task, roles, members, checkins, active_tasks, "all_list"
        )

