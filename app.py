"""JASC79 タスク・NA管理アプリのエントリポイント（ナビゲーション・言語切替）。"""

from __future__ import annotations

import streamlit as st

from core.i18n import t
from core.models import LangCode
from core.session import (
    get_current_member,
    get_lang,
    get_repo,
    init_session_state,
    open_create_task_dialog,
)


def main() -> None:
    """アプリのナビゲーションとサイドバー（言語切替・操作メンバー表示）を構成して実行する。"""
    st.set_page_config(
        page_title="JASC79 タスク・NA管理",
        page_icon="📋",
        layout="wide",
    )
    init_session_state()
    repo = get_repo()
    lang = get_lang()
    current_member = get_current_member()
    members = repo.list_members(active_only=True)
    member_map = {m.member_id: m for m in members}

    with st.sidebar:
        st.markdown(f"### 📋 {t('app.title', lang)}")
        st.caption(
            f"👤 {t('app.logged_in_as', lang, name=current_member.get_name(lang))}"
        )

        # F11：日本語 / English 切替
        lang_options: list[LangCode] = ["ja", "en"]
        lang_labels = {"ja": "日本語", "en": "English"}
        selected_lang = st.radio(
            t("app.lang_label", lang),
            options=lang_options,
            index=1 if lang == "en" else 0,
            format_func=lambda code: lang_labels[code],
            horizontal=True,
            key="lang_choice",
        )
        st.session_state["lang"] = selected_lang
        if selected_lang != current_member.lang:
            repo.update_member_lang(current_member.member_id, selected_lang)
        lang = selected_lang

        # 開発確認用：操作中メンバーの切替（初期値はメンバーA m001）
        with st.expander(t("app.switch_user_label", lang)):
            member_ids = [m.member_id for m in members]
            curr_m_idx = (
                member_ids.index(current_member.member_id)
                if current_member.member_id in member_ids
                else 0
            )
            chosen_mid = st.selectbox(
                t("common.owner", lang),
                options=member_ids,
                index=curr_m_idx,
                format_func=lambda mid: member_map[mid].get_name(lang),
                key="sidebar_member_select",
            )
            if chosen_mid != current_member.member_id:
                st.session_state["current_member_id"] = chosen_mid
                st.rerun()

        if st.button(
            t("app.new_task_btn", lang),
            type="primary",
            use_container_width=True,
            key="sidebar_new_task_btn",
        ):
            open_create_task_dialog()

    pages = [
        st.Page("pages/board.py", title=t("nav.board", lang), icon="🏠", default=True),
        st.Page("pages/role_detail.py", title=t("nav.role_detail", lang), icon="📂"),
        st.Page("pages/my_tasks.py", title=t("nav.my_tasks", lang), icon="🙋"),
        st.Page("pages/alerts.py", title=t("nav.alerts", lang), icon="⏰"),
        st.Page("pages/all_tasks.py", title=t("nav.all_tasks", lang), icon="📑"),
        st.Page("pages/inbox.py", title=t("nav.inbox", lang), icon="📬"),
        st.Page("pages/checkin.py", title=t("nav.checkin", lang), icon="💚"),
        st.Page("pages/capacity_map.py", title=t("nav.capacity_map", lang), icon="🗺️"),
        st.Page("pages/progress.py", title=t("nav.progress", lang), icon="📈"),
        st.Page("pages/minutes.py", title=t("nav.minutes", lang), icon="📝"),
    ]
    nav = st.navigation(pages)
    nav.run()


if __name__ == "__main__":
    main()
