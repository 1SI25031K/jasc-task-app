"""F4：マイタスク画面。自分が担当者のタスクを「依頼中」「進行中・未着手」「待ち」「完了」に分けて表示する。"""

from __future__ import annotations

import streamlit as st

from core.i18n import t
from core.load import calc_member_auto_load_breakdown, get_latest_checkin
from core.session import (
    format_subjective_score_badge,
    get_current_member,
    get_lang,
    get_repo,
    get_today,
    open_create_task_dialog,
    render_task_card,
)

repo = get_repo()
lang = get_lang()
today = get_today()
current_member = get_current_member()

roles = repo.list_roles(active_only=True)
members = repo.list_members(active_only=True)
all_tasks = repo.list_tasks(include_archived=False)
checkins = repo.list_checkins()
settings = repo.get_settings()

hdr_col1, hdr_col2 = st.columns([3, 1])
with hdr_col1:
    st.title(
        f"🙋 {t('my_tasks.title', lang)}（{current_member.get_name(lang)}）"
    )
with hdr_col2:
    if st.button(
        t("app.new_task_btn", lang),
        type="primary",
        use_container_width=True,
        key="my_tasks_new_btn",
    ):
        open_create_task_dialog()

# 自分の自動負荷・体感負荷サマリー（F4）
breakdown = calc_member_auto_load_breakdown(
    current_member.member_id, all_tasks, today, settings
)
latest_c, is_fresh = get_latest_checkin(
    current_member.member_id, checkins, today
)
subj_badge = format_subjective_score_badge(
    latest_c.score if latest_c else None, is_fresh, lang
)
with st.container(border=True):
    st.markdown(
        t(
            "my_tasks.load_summary",
            lang,
            total_pt=breakdown.total_points,
            accepted_pt=breakdown.accepted_points,
            pending_pt=breakdown.pending_points,
            subj=subj_badge,
        )
    )

my_tasks = [
    task
    for task in all_tasks
    if task.owner_member_id == current_member.member_id
]

pending_req_tasks = sorted(
    (
        t
        for t in my_tasks
        if t.status != "完了" and t.assignment_status in ("依頼中", "相談中")
    ),
    key=lambda x: (x.na_due, x.task_id),
)
active_tasks = sorted(
    (
        t
        for t in my_tasks
        if t.status in ("進行中", "未着手") and t.assignment_status == "承諾済"
    ),
    key=lambda x: (x.na_due, x.task_id),
)
waiting_tasks = sorted(
    (t for t in my_tasks if t.status == "待ち"),
    key=lambda x: (x.na_due, x.task_id),
)
done_tasks = sorted(
    (t for t in my_tasks if t.status == "完了"),
    key=lambda x: (x.na_due, x.task_id),
    reverse=True,
)

tabs = st.tabs(
    [
        t("my_tasks.tab_active", lang, count=len(active_tasks)),
        t(
            "my_tasks.tab_pending_requests",
            lang,
            count=len(pending_req_tasks),
        ),
        t("my_tasks.tab_waiting", lang, count=len(waiting_tasks)),
        t("my_tasks.tab_done", lang, count=len(done_tasks)),
    ]
)

with tabs[0]:
    if not active_tasks:
        st.info(t("my_tasks.empty_tab", lang))
    else:
        for task in active_tasks:
            render_task_card(
                task, roles, members, checkins, all_tasks, "my_active"
            )

with tabs[1]:
    st.caption(t("my_tasks.go_to_inbox_hint", lang))
    if not pending_req_tasks:
        st.info(t("my_tasks.empty_tab", lang))
    else:
        for task in pending_req_tasks:
            render_task_card(
                task, roles, members, checkins, all_tasks, "my_req"
            )

with tabs[2]:
    if not waiting_tasks:
        st.info(t("my_tasks.empty_tab", lang))
    else:
        for task in waiting_tasks:
            render_task_card(
                task, roles, members, checkins, all_tasks, "my_wait"
            )

with tabs[3]:
    if not done_tasks:
        st.info(t("my_tasks.empty_tab", lang))
    else:
        for task in done_tasks:
            render_task_card(
                task, roles, members, checkins, all_tasks, "my_done"
            )

