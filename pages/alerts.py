"""F5：期限アラート画面（定例会で画面共有して使う想定）。①期限切れNA ②今週期限NA ③停滞タスク ④返事のない依頼 を表示する。"""

from __future__ import annotations

from datetime import timedelta
import streamlit as st

from core.i18n import t
from core.services import is_due_this_week, is_overdue_na, is_stale_task
from core.session import (
    get_lang,
    get_now,
    get_repo,
    get_today,
    render_task_card,
)

repo = get_repo()
lang = get_lang()
today = get_today()
now = get_now()

roles = repo.list_roles(active_only=True)
members = repo.list_members(active_only=True)
all_tasks = repo.list_tasks(include_archived=False)
checkins = repo.list_checkins()
settings = repo.get_settings()

st.title(f"⏰ {t('alerts.title', lang)}")
st.caption(t("alerts.subtitle", lang))

overdue_tasks = sorted(
    (task for task in all_tasks if is_overdue_na(task, today)),
    key=lambda x: (x.na_due, x.task_id),
)
due_week_tasks = sorted(
    (task for task in all_tasks if is_due_this_week(task, today)),
    key=lambda x: (x.na_due, x.task_id),
)
stale_tasks = sorted(
    (
        task
        for task in all_tasks
        if is_stale_task(task, now, stale_days=settings.stale_days)
    ),
    key=lambda x: (x.updated_at, x.task_id),
)
pending_req_tasks = sorted(
    (
        task
        for task in all_tasks
        if task.status != "完了"
        and task.assignment_status == "依頼中"
        and (now - task.updated_at)
        >= timedelta(days=settings.request_reminder_days)
    ),
    key=lambda x: (x.updated_at, x.task_id),
)

# 4つの集計メトリクスカード
m1, m2, m3, m4 = st.columns(4)
with m1:
    st.metric(t("alerts.metric_overdue", lang), len(overdue_tasks))
with m2:
    st.metric(t("alerts.metric_due_week", lang), len(due_week_tasks))
with m3:
    st.metric(t("alerts.metric_stale", lang), len(stale_tasks))
with m4:
    st.metric(t("alerts.metric_pending_req", lang), len(pending_req_tasks))

tabs = st.tabs(
    [
        f"{t('alerts.metric_overdue', lang)} ({len(overdue_tasks)})",
        f"{t('alerts.metric_due_week', lang)} ({len(due_week_tasks)})",
        f"{t('alerts.metric_stale', lang)} ({len(stale_tasks)})",
        f"{t('alerts.metric_pending_req', lang)} ({len(pending_req_tasks)})",
    ]
)

with tabs[0]:
    st.subheader(t("alerts.sec_overdue", lang))
    if not overdue_tasks:
        st.success(t("alerts.empty_section", lang))
    else:
        for task in overdue_tasks:
            render_task_card(
                task, roles, members, checkins, all_tasks, "alert_overdue"
            )

with tabs[1]:
    st.subheader(t("alerts.sec_due_week", lang))
    if not due_week_tasks:
        st.info(t("alerts.empty_section", lang))
    else:
        for task in due_week_tasks:
            render_task_card(
                task, roles, members, checkins, all_tasks, "alert_week"
            )

with tabs[2]:
    st.subheader(t("alerts.sec_stale", lang))
    if not stale_tasks:
        st.info(t("alerts.empty_section", lang))
    else:
        for task in stale_tasks:
            days_ago = (now - task.updated_at).days
            st.caption(
                f"⏸️ {t('alerts.days_since_update', lang, days=days_ago)}"
            )
            render_task_card(
                task, roles, members, checkins, all_tasks, "alert_stale"
            )

with tabs[3]:
    st.subheader(t("alerts.sec_pending_req", lang))
    if not pending_req_tasks:
        st.info(t("alerts.empty_section", lang))
    else:
        for task in pending_req_tasks:
            render_task_card(
                task, roles, members, checkins, all_tasks, "alert_req"
            )

