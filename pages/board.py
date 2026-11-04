"""F2：役職ボード（ホーム画面）。全役職をカテゴリ別にカード表示し、上部にお知らせを表示する。"""

from __future__ import annotations

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
    open_create_task_dialog,
)

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

# ページタイトル & 新規タスク作成ボタン
hdr_col1, hdr_col2 = st.columns([3, 1])
with hdr_col1:
    st.title(f":material/dashboard: {t('board.title', lang)}")
    st.caption(t("board.subtitle", lang))
with hdr_col2:
    if st.button(
        t("app.new_task_btn", lang),
        type="primary",
        use_container_width=True,
        key="board_new_task_btn",
    ):
        open_create_task_dialog()

# 上部お知らせバナー（F2：「あなたへの依頼 ○件」「体感負荷が未回答です」）
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
                st.warning(
                    t("board.banner_requests", lang, count=pending_req_count)
                )
                if st.button(
                    f":material/arrow_forward: {t('board.banner_requests_btn', lang)}",
                    key="banner_go_inbox",
                    use_container_width=True,
                ):
                    st.switch_page("pages/inbox.py")
    with b_col2:
        if checkin_unanswered:
            with st.container(border=True):
                st.info(t("board.banner_checkin", lang))
                if st.button(
                    f":material/arrow_forward: {t('board.banner_checkin_btn', lang)}",
                    key="banner_go_checkin",
                    use_container_width=True,
                ):
                    st.switch_page("pages/checkin.py")

summaries = build_role_board_summaries(
    roles=roles,
    members=members,
    role_assignments=role_assignments,
    tasks=tasks,
    today=today,
)


def _render_role_card(summary: RoleBoardSummary) -> None:
    """役職カード1枚を描画する。"""
    role = summary.role
    lead_name = (
        summary.lead_member.get_name(lang)
        if summary.lead_member
        else t("common.unassigned", lang)
    )
    with st.container(border=True):
        st.subheader(role.get_name(lang))
        st.caption(f":material/person: {t('common.lead', lang)}: **{lead_name}**")

        overdue_badge = (
            f":red-badge[{t('board.overdue_nas', lang)}: {summary.overdue_na_count}]"
            if summary.overdue_na_count > 0
            else f":gray-badge[{t('board.overdue_nas', lang)}: 0]"
        )
        week_badge = (
            f":orange-badge[{t('board.due_this_week_nas', lang)}: {summary.due_this_week_na_count}]"
            if summary.due_this_week_na_count > 0
            else f":gray-badge[{t('board.due_this_week_nas', lang)}: 0]"
        )
        open_badge = (
            f":blue-badge[{t('board.open_tasks', lang)}: {summary.open_task_count}]"
        )
        st.markdown(f"{open_badge} {overdue_badge} {week_badge}")

        if summary.nearest_na_task is not None:
            nt = summary.nearest_na_task
            nt_owner = member_map.get(nt.owner_member_id)
            nt_owner_name = (
                nt_owner.get_name(lang) if nt_owner else nt.owner_member_id
            )
            st.markdown(
                f":material/push_pin: **{t('board.nearest_na', lang)}**: {nt.next_action}\n"
                f"（{format_date(nt.na_due, lang)} ／ {nt_owner_name}）"
            )
        else:
            st.caption(f":material/push_pin: {t('board.no_open_na', lang)}")

        if st.button(
            f":material/folder: {t('board.open_role_detail', lang)}",
            key=f"open_role_{role.role_id}",
            use_container_width=True,
        ):
            st.session_state["selected_role_id"] = role.role_id
            st.switch_page("pages/role_detail.py")


# カテゴリ別タブで表示（スマホでは各カードが1列にスタックされる）
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

