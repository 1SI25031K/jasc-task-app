"""JASC タスクマネージャーのエントリポイント（認証ゲート・ナビゲーション・言語切替）。"""

from __future__ import annotations

import streamlit as st

from core.auth import require_authenticated_member
from core.i18n import t
from core.models import LangCode
from core.session import (
    get_lang,
    get_repo,
    init_session_state,
    open_create_task_dialog,
)


def main() -> None:
    """S1 認証チェックを最優先で実行し、承認されたメンバーのみにナビゲーションと各画面を表示する。"""
    st.set_page_config(
        page_title="JASC タスクマネージャー",
        page_icon=":material/assignment:",
        layout="wide",
    )
    init_session_state()
    repo = get_repo()

    # S1：どの業務データ読み込みよりも前に必ず認証・メンバー名簿照合を実行する
    current_member = require_authenticated_member(repo, lang=get_lang())
    lang = get_lang()

    with st.sidebar:
        st.markdown(f"### :material/assignment: {t('app.title', lang)}")
        st.caption(
            f":material/person: {t('app.logged_in_as', lang, name=current_member.get_name(lang))}"
        )
        st.caption(f":material/mail: {current_member.email}")

        # F11：日本語 / English 切替（ログイン本人の members.lang にも保存）
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

        if st.button(
            t("app.new_task_btn", lang),
            type="primary",
            use_container_width=True,
            key="sidebar_new_task_btn",
        ):
            open_create_task_dialog()

        st.divider()
        if st.button(
            f":material/logout: {t('app.logout_btn', lang)}",
            use_container_width=True,
            key="sidebar_logout_btn",
        ):
            st.logout()

    pages = [
        st.Page("pages/board.py", title=t("nav.board", lang), icon=":material/dashboard:", default=True),
        st.Page("pages/role_detail.py", title=t("nav.role_detail", lang), icon=":material/folder:"),
        st.Page("pages/my_tasks.py", title=t("nav.my_tasks", lang), icon=":material/person:"),
        st.Page("pages/alerts.py", title=t("nav.alerts", lang), icon=":material/alarm:"),
        st.Page("pages/all_tasks.py", title=t("nav.all_tasks", lang), icon=":material/format_list_bulleted:"),
        st.Page("pages/inbox.py", title=t("nav.inbox", lang), icon=":material/inbox:"),
        st.Page("pages/checkin.py", title=t("nav.checkin", lang), icon=":material/mood:"),
        st.Page("pages/capacity_map.py", title=t("nav.capacity_map", lang), icon=":material/map:"),
        st.Page("pages/progress.py", title=t("nav.progress", lang), icon=":material/trending_up:"),
        st.Page("pages/minutes.py", title=t("nav.minutes", lang), icon=":material/edit_note:"),
    ]
    nav = st.navigation(pages)
    nav.run()


if __name__ == "__main__":
    main()
