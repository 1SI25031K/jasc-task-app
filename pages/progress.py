"""F13：進捗グラフ画面。①全体完了率の推移 ②役職別の現在の完了率 ③役職別の期限切れNA数 ④メンバー別の自動負荷の推移を表示する。"""

from __future__ import annotations

from datetime import timedelta
import altair as alt
import pandas as pd
import streamlit as st

from core.i18n import t
from core.services import calc_completion_rate, is_overdue_na
from core.session import get_lang, get_repo, get_today

repo = get_repo()
lang = get_lang()
today = get_today()

roles = repo.list_roles(active_only=True)
members = repo.list_members(active_only=True)
tasks = repo.list_tasks(include_archived=False)
snapshots = repo.list_daily_snapshots()

role_map = {r.role_id: r for r in roles}
member_map = {m.member_id: m for m in members}

st.title(f"📈 {t('progress.title', lang)}")

# 期間選択（4週／12週／全期間）
period_options = ["4w", "12w", "all"]
period_labels = {
    "4w": t("progress.period_4w", lang),
    "12w": t("progress.period_12w", lang),
    "all": t("progress.period_all", lang),
}
selected_period = st.radio(
    t("progress.period_label", lang),
    options=period_options,
    index=1,
    format_func=lambda k: period_labels[k],
    horizontal=True,
    key="progress_period_radio",
)

if selected_period == "4w":
    start_date = today - timedelta(days=28)
elif selected_period == "12w":
    start_date = today - timedelta(days=84)
else:
    start_date = today - timedelta(days=3650)

filtered_snaps = [s for s in snapshots if s.date >= start_date]

col1, col2 = st.columns(2)

# ① 全体の完了率の推移（折れ線グラフ）
with col1:
    with st.container(border=True):
        st.subheader(t("progress.chart1_title", lang))
        all_snaps = sorted(
            (s for s in filtered_snaps if s.scope_type == "ALL"),
            key=lambda s: s.date,
        )
        if all_snaps:
            df_c1 = pd.DataFrame(
                [
                    {
                        "date": s.date.strftime("%m/%d"),
                        "rate": round(s.completion_rate * 100, 1),
                        "order": idx,
                    }
                    for idx, s in enumerate(all_snaps)
                ]
            )
            c1 = (
                alt.Chart(df_c1)
                .mark_line(point=True, color="#2563eb")
                .encode(
                    x=alt.X(
                        "date:N",
                        sort=alt.EncodingSortField("order"),
                        title=None,
                    ),
                    y=alt.Y(
                        "rate:Q",
                        scale=alt.Scale(domain=[0, 100]),
                        title="%",
                    ),
                    tooltip=["date:N", "rate:Q"],
                )
                .properties(height=260)
            )
            st.altair_chart(c1, use_container_width=True)

# ② 役職別の現在の完了率（棒グラフ）
with col2:
    with st.container(border=True):
        st.subheader(t("progress.chart2_title", lang))
        role_rate_rows = []
        for r in roles:
            r_tasks = [task for task in tasks if r.role_id in task.role_ids]
            if not r_tasks:
                continue
            rate = calc_completion_rate(r_tasks)
            role_rate_rows.append(
                {
                    "role": r.get_name(lang),
                    "rate": round((rate or 0.0) * 100, 1),
                }
            )
        if role_rate_rows:
            df_c2 = pd.DataFrame(role_rate_rows)
            c2 = (
                alt.Chart(df_c2)
                .mark_bar(color="#10b981")
                .encode(
                    y=alt.Y("role:N", sort="-x", title=None),
                    x=alt.X(
                        "rate:Q",
                        scale=alt.Scale(domain=[0, 100]),
                        title="%",
                    ),
                    tooltip=["role:N", "rate:Q"],
                )
                .properties(height=260)
            )
            st.altair_chart(c2, use_container_width=True)

col3, col4 = st.columns(2)

# ③ 役職別の期限を過ぎた NA 数（棒グラフ）
with col3:
    with st.container(border=True):
        st.subheader(t("progress.chart3_title", lang))
        overdue_rows = []
        for r in roles:
            r_tasks = [task for task in tasks if r.role_id in task.role_ids]
            if not r_tasks:
                continue
            ov_count = sum(1 for task in r_tasks if is_overdue_na(task, today))
            overdue_rows.append(
                {
                    "role": r.get_name(lang),
                    "overdue": ov_count,
                }
            )
        if overdue_rows:
            df_c3 = pd.DataFrame(overdue_rows)
            c3 = (
                alt.Chart(df_c3)
                .mark_bar(color="#ef4444")
                .encode(
                    y=alt.Y("role:N", sort="-x", title=None),
                    x=alt.X("overdue:Q", title=None),
                    tooltip=["role:N", "overdue:Q"],
                )
                .properties(height=260)
            )
            st.altair_chart(c3, use_container_width=True)

# ④ メンバー別の自動負荷の推移（折れ線グラフ）
with col4:
    with st.container(border=True):
        st.subheader(t("progress.chart4_title", lang))
        member_snaps = sorted(
            (s for s in filtered_snaps if s.scope_type == "member"),
            key=lambda s: s.date,
        )
        if member_snaps:
            df_c4 = pd.DataFrame(
                [
                    {
                        "date": s.date.strftime("%m/%d"),
                        "member": (
                            member_map[s.scope_id].get_name(lang)
                            if s.scope_id in member_map
                            else s.scope_id
                        ),
                        "auto_load": s.auto_load or 0,
                        "order": s.date.toordinal(),
                    }
                    for s in member_snaps
                ]
            )
            c4 = (
                alt.Chart(df_c4)
                .mark_line(point=True)
                .encode(
                    x=alt.X(
                        "date:N",
                        sort=alt.EncodingSortField("order"),
                        title=None,
                    ),
                    y=alt.Y("auto_load:Q", title="pt"),
                    color=alt.Color("member:N", title=None),
                    tooltip=["date:N", "member:N", "auto_load:Q"],
                )
                .properties(height=260)
            )
            st.altair_chart(c4, use_container_width=True)
