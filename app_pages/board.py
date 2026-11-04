"""F2：役職ボード。全役職をカテゴリ別にカード表示し、上部にお知らせを表示する（フェーズ 7.6-R）。"""

from __future__ import annotations

import html
import streamlit as st

from core.i18n import format_date, t, translate_category
from core.models import RoleCategory
from core.services import (
    RoleBoardSummary,
    build_role_board_summaries,
    count_pending_requests_for_member,
    is_checkin_unanswered_for_member,
)
from core.session import (
    get_current_member,
    get_lang,
    get_repo,
    get_today,
)
from core.ui.page_header import render_page_header

CATEGORIES: list[RoleCategory] = ["主役職", "副役職", "サイト", "その他"]

repo = get_repo()
lang = get_lang()
today = get_today()
current_member = get_current_member()

roles = repo.list_roles(active_only=True)
members = repo.list_members(active_only=True)
role_assignments = repo.list_role_assignments()
tasks = repo.list_tasks(include_archived=False)
checkins = repo.list_checkins()
settings = repo.get_settings()
member_map = {m.member_id: m for m in members}

# 1. ページヘッダー（アイコンなし 32px 400 見出し、1行サブタイトル、右上タスク作成ボタン）
render_page_header(
    title=t("board.title", lang),
    subtitle=t("board.subtitle", lang),
    lang=lang,
    show_new_task=True,
    key_suffix="board",
)

# 2. 上部お知らせバナー（F2：「あなたへの依頼 ○件」「体感負荷が未回答です」）
pending_req_count = count_pending_requests_for_member(
    current_member.member_id, tasks
)
checkin_unanswered = is_checkin_unanswered_for_member(
    current_member.member_id, checkins, today, settings
)

if pending_req_count > 0 or checkin_unanswered:
    b_col1, b_col2 = st.columns(2)
    with b_col1:
        if pending_req_count > 0:
            with st.container(border=True):
                st.markdown(
                    f"**{t('board.banner_requests', lang, count=pending_req_count)}**"
                )
                if st.button(
                    t("board.banner_requests_btn", lang),
                    key="banner_go_inbox",
                    type="secondary",
                ):
                    st.switch_page("app_pages/inbox.py")
    with b_col2:
        if checkin_unanswered:
            with st.container(border=True):
                st.markdown(f"**{t('board.banner_checkin', lang)}**")
                if st.button(
                    t("board.banner_checkin_btn", lang),
                    key="banner_go_checkin",
                    type="secondary",
                ):
                    st.switch_page("app_pages/checkin.py")

summaries = build_role_board_summaries(
    roles=roles,
    members=members,
    role_assignments=role_assignments,
    tasks=tasks,
    today=today,
)


def _render_role_card(summary: RoleBoardSummary) -> None:
    """役職カード1枚を描画する（白背景、角丸 28px、枠線なし、バッジ廃止、右下テキストボタン）。"""
    role = summary.role
    lead_name = (
        summary.lead_member.get_name(lang)
        if summary.lead_member
        else t("common.unassigned", lang)
    )
    safe_role_name = html.escape(role.get_name(lang))
    safe_lead_name = html.escape(lead_name)

    # 1行件数表示（期限切れ数のみ赤色 #B3261E）
    if lang == "ja":
        overdue_part = (
            f"<span style='color: #B3261E; font-weight: 500;'>期限切れ {summary.overdue_na_count}</span>"
            if summary.overdue_na_count > 0
            else "期限切れ 0"
        )
        cnt_text = f"未完了 {summary.open_task_count} · {overdue_part} · 今週 {summary.due_this_week_na_count}"
        lead_label = "責任者"
        detail_btn_label = "役職詳細"
    else:
        overdue_part = (
            f"<span style='color: #B3261E; font-weight: 500;'>Overdue {summary.overdue_na_count}</span>"
            if summary.overdue_na_count > 0
            else "Overdue 0"
        )
        cnt_text = f"Open {summary.open_task_count} · {overdue_part} · This week {summary.due_this_week_na_count}"
        lead_label = "Lead"
        detail_btn_label = "Details"

    with st.container(border=True):
        st.html(
            f"""
        <div style="margin-bottom: 8px;">
            <div style="font-family: 'Google Sans Flex', 'Noto Sans JP', sans-serif; font-size: 22px; font-weight: 400; color: #1F1F1F; margin-bottom: 4px;">
                {safe_role_name}
            </div>
            <div style="font-size: 14px; color: #444746; margin-bottom: 8px;">
                {lead_label}: {safe_lead_name}
            </div>
            <div style="font-size: 14px; color: #444746; margin-bottom: 12px;">
                {cnt_text}
            </div>
        </div>
        """
        )

        # 直近NA（1行で長い場合は省略）
        if summary.nearest_na_task is not None:
            nt = summary.nearest_na_task
            nt_owner = member_map.get(nt.owner_member_id)
            nt_owner_name = (
                nt_owner.get_name(lang) if nt_owner else nt.owner_member_id
            )
            safe_na = html.escape(nt.next_action)
            safe_owner = html.escape(nt_owner_name)
            date_str = format_date(nt.na_due, lang)
            st.html(
                f"""
            <div style="font-size: 13px; color: #1F1F1F; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 12px;" title="{safe_na}">
                <span style="color: #444746;">NA:</span> <strong>{safe_na}</strong> ({date_str} ／ {safe_owner})
            </div>
            """
            )
        else:
            st.html(
                f'<div style="font-size: 13px; color: #747775; margin-bottom: 12px;">{html.escape(t("board.no_open_na", lang))}</div>'
            )

        # 右下の小さなテキストボタン（幅いっぱいボタンを廃止）
        btn_col_sp, btn_col_act = st.columns([2.5, 1.5])
        with btn_col_act:
            if st.button(
                detail_btn_label,
                key=f"open_role_{role.role_id}",
                type="secondary",
            ):
                st.session_state["selected_role_id"] = role.role_id
                st.switch_page("app_pages/role_detail.py")


# カテゴリ別タブで表示
tab_labels = [
    f"{translate_category(cat, lang)} ({sum(1 for s in summaries if s.role.category == cat)})"
    for cat in CATEGORIES
]
tabs = st.tabs(tab_labels)

for tab, cat in zip(tabs, CATEGORIES):
    with tab:
        cat_summaries = [s for s in summaries if s.role.category == cat]
        cols = st.columns(2)
        for idx, summary in enumerate(cat_summaries):
            with cols[idx % 2]:
                _render_role_card(summary)
