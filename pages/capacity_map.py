"""F15：余力マップ画面。全メンバーの自動負荷（承諾済/依頼中色分け棒グラフ）、最新の体感負荷と一言、直近4回の推移、ずれの印を表示する。"""

from __future__ import annotations

import altair as alt
import pandas as pd
import streamlit as st

from core.i18n import format_date, t
from core.load import (
    calc_member_auto_load_breakdown,
    get_latest_checkin,
    has_load_gap,
    scale_auto_loads_to_10,
)
from core.services import count_pending_requests_for_member, is_due_this_week
from core.session import (
    format_subjective_score_badge,
    get_lang,
    get_repo,
    get_today,
)

repo = get_repo()
lang = get_lang()
today = get_today()

members = repo.list_members(active_only=True)
tasks = repo.list_tasks(include_archived=False)
checkins = repo.list_checkins()
settings = repo.get_settings()

st.title(f"🗺️ {t('capacity_map.title', lang)}")

# 必須要件（F15・6.3）：評価には使わない旨をページ上部に常に表示
st.info(t("capacity_map.policy_banner", lang))

with st.expander(t("capacity_map.help_expander", lang)):
    st.markdown(t("capacity_map.help_body", lang))

# 全メンバーの自動負荷内訳と1〜10換算を計算
breakdowns = {
    m.member_id: calc_member_auto_load_breakdown(
        m.member_id, tasks, today, settings
    )
    for m in members
}
total_loads = {
    m_id: bd.total_points for m_id, bd in breakdowns.items()
}
scaled_loads = scale_auto_loads_to_10(total_loads)

# 1. メンバー別の自動負荷（承諾済 vs 依頼・相談中 の色分け横棒グラフ 5.3・F15）
st.subheader(f"📊 {t('capacity_map.chart_title', lang)}")
chart_rows = []
accepted_label = t("capacity_map.legend_accepted", lang)
pending_label = t("capacity_map.legend_pending", lang)

for m in members:
    bd = breakdowns[m.member_id]
    m_name = m.get_name(lang)
    chart_rows.append(
        {
            "member": m_name,
            "type": accepted_label,
            "points": bd.accepted_points,
        }
    )
    chart_rows.append(
        {
            "member": m_name,
            "type": pending_label,
            "points": bd.pending_points,
        }
    )

df_bar = pd.DataFrame(chart_rows)
bar_chart = (
    alt.Chart(df_bar)
    .mark_bar()
    .encode(
        y=alt.Y("member:N", sort=None, title=None),
        x=alt.X("points:Q", title="pt"),
        color=alt.Color(
            "type:N",
            scale=alt.Scale(
                domain=[accepted_label, pending_label],
                range=["#2563eb", "#93c5fd"],
            ),
            legend=alt.Legend(orient="top", title=None),
        ),
        tooltip=["member:N", "type:N", "points:Q"],
    )
    .properties(height=260)
)
st.altair_chart(bar_chart, use_container_width=True)

# 2. メンバー別の詳細カード一覧（ずれの印・直近4回の体感負荷ミニ折れ線付き）
st.subheader(f"👥 {t('capacity_map.member_cards_title', lang)}")
cols = st.columns(2)

for idx, m in enumerate(members):
    bd = breakdowns[m.member_id]
    latest_c, is_fresh = get_latest_checkin(m.member_id, checkins, today)
    subj_score = latest_c.score if (latest_c and is_fresh) else None
    is_gap = has_load_gap(scaled_loads.get(m.member_id, 1), subj_score)

    m_open_tasks = [
        task
        for task in tasks
        if task.owner_member_id == m.member_id and task.status != "完了"
    ]
    due_week_cnt = sum(1 for task in m_open_tasks if is_due_this_week(task, today))
    pending_req_cnt = count_pending_requests_for_member(m.member_id, tasks)

    with cols[idx % 2]:
        with st.container(border=True):
            st.markdown(f"#### 👤 {m.get_name(lang)}")
            if is_gap:
                st.warning(t("capacity_map.gap_badge", lang))

            subj_badge = format_subjective_score_badge(
                latest_c.score if latest_c else None, is_fresh, lang
            )
            st.markdown(
                f"・{t('capacity_map.auto_load_label', lang, total=bd.total_points, accepted=bd.accepted_points, pending=bd.pending_points)}\n"
                f"・{t('capacity_map.subj_load_label', lang, score=subj_badge)}"
            )

            if latest_c and latest_c.comment.strip():
                st.caption(
                    f"💬 {t('capacity_map.comment_label', lang, comment=latest_c.comment, date=format_date(latest_c.date, lang))}"
                )
            else:
                st.caption(f"💬 {t('capacity_map.no_comment', lang)}")

            st.caption(
                f"📅 {t('capacity_map.due_week_count', lang, count=due_week_cnt)} ｜ "
                f"📩 {t('capacity_map.pending_req_count', lang, count=pending_req_cnt)}"
            )

            # 直近4回の体感負荷推移（小さな折れ線）
            m_checkins = [
                c for c in checkins if c.member_id == m.member_id
            ][-4:]
            if m_checkins:
                st.caption(f"📈 {t('capacity_map.trend_label', lang)}")
                df_trend = pd.DataFrame(
                    [
                        {
                            "date": c.date.strftime("%m/%d"),
                            "score": c.score,
                            "order": i,
                        }
                        for i, c in enumerate(m_checkins)
                    ]
                )
                line_chart = (
                    alt.Chart(df_trend)
                    .mark_line(point=True, color="#10b981")
                    .encode(
                        x=alt.X("date:N", sort=alt.EncodingSortField("order"), title=None),
                        y=alt.Y(
                            "score:Q",
                            scale=alt.Scale(domain=[1, 10]),
                            title=None,
                        ),
                        tooltip=["date:N", "score:Q"],
                    )
                    .properties(height=110)
                )
                st.altair_chart(line_chart, use_container_width=True)
