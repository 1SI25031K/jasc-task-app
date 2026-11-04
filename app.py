"""JASC タスクマネージャーのエントリポイント（認証ゲート・ナビゲーション・上部バー・スタイル統合）。"""

from __future__ import annotations

import streamlit as st

from core.auth import require_authenticated_member
from core.i18n import t
from core.session import (
    get_lang,
    get_repo,
    init_session_state,
)
from core.ui.background import fetch_bing_today_wallpaper, generate_background_css
from core.ui.style import apply_global_styles
from core.ui.top_bar import render_top_bar


def main() -> None:
    """S1 認証チェックを最優先で実行し、Google アカウント管理風の統一レイアウトを描画する。"""
    st.set_page_config(
        page_title="JASC タスクマネージャー",
        page_icon=":material/assignment:",
        layout="wide",
        initial_sidebar_state="auto",
    )
    init_session_state()
    apply_global_styles()
    repo = get_repo()

    # S1：どの業務データ読み込みよりも前に必ず認証・メンバー名簿照合を実行する
    current_member = require_authenticated_member(repo, lang=get_lang())
    lang = get_lang()

    # ユーザー固有の背景設定（フェーズ 7.7-C）を適用
    wallpaper = (
        fetch_bing_today_wallpaper()
        if current_member.bg_mode == "bing"
        else None
    )
    st.html(
        generate_background_css(
            current_member.bg_mode, current_member.bg_color, wallpaper
        )
    )

    # 1. 10項目のナビゲーションページ（要件順・明示的 url_path）
    home_page = st.Page("app_pages/home.py", title=t("nav.home", lang), icon=":material/home:", url_path="home", default=True)
    board_page = st.Page("app_pages/board.py", title=t("nav.board", lang), icon=":material/dashboard:", url_path="board")
    my_tasks_page = st.Page("app_pages/my_tasks.py", title=t("nav.my_tasks", lang), icon=":material/person:", url_path="my_tasks")
    inbox_page = st.Page("app_pages/inbox.py", title=t("nav.inbox", lang), icon=":material/inbox:", url_path="inbox")
    alerts_page = st.Page("app_pages/alerts.py", title=t("nav.alerts", lang), icon=":material/alarm:", url_path="alerts")
    all_tasks_page = st.Page("app_pages/all_tasks.py", title=t("nav.all_tasks", lang), icon=":material/format_list_bulleted:", url_path="all_tasks")
    capacity_map_page = st.Page("app_pages/capacity_map.py", title=t("nav.capacity_map", lang), icon=":material/map:", url_path="capacity_map")
    checkin_page = st.Page("app_pages/checkin.py", title=t("nav.checkin", lang), icon=":material/mood:", url_path="checkin")
    minutes_page = st.Page("app_pages/minutes.py", title=t("nav.minutes", lang), icon=":material/edit_note:", url_path="minutes")
    progress_page = st.Page("app_pages/progress.py", title=t("nav.progress", lang), icon=":material/trending_up:", url_path="progress")

    # 役職詳細はナビから外すが、ボード等から st.switch_page できるようページ定義には含める
    role_detail_page = st.Page("app_pages/role_detail.py", title=t("nav.role_detail", lang), icon=":material/folder:", url_path="role_detail")

    nav_pages = [
        home_page,
        board_page,
        my_tasks_page,
        inbox_page,
        alerts_page,
        all_tasks_page,
        capacity_map_page,
        checkin_page,
        minutes_page,
        progress_page,
    ]

    all_pages = nav_pages + [role_detail_page]

    # 標準ナビゲーション一覧を隠し、自前で st.sidebar 内に描画する
    nav = st.navigation(all_pages, position="hidden")

    # 2. サイドバーの自前ナビゲーション描画（幅 280px、色付き丸アイコン、ピル選択）
    with st.sidebar:
        st.html('<div style="height: 8px;"></div>')
        for idx, page in enumerate(nav_pages, start=1):
            is_active = (nav.url_path == page.url_path) or (nav == page)
            key = f"nav_active_item_{idx}" if is_active else f"nav_item_{idx}"
            with st.container(key=key):
                st.page_link(page, label=page.title, icon=page.icon)

        # サイドバー最下部の補助リンク
        footer_text = (
            '<div class="sidebar-footer-links">'
            '<span>使い方</span> · <span>ヘルプ</span> · <span>このアプリについて</span>'
            '</div>'
            if lang == "ja"
            else
            '<div class="sidebar-footer-links">'
            '<span>Guide</span> · <span>Help</span> · <span>About</span>'
            '</div>'
        )
        st.html(footer_text)

        # 今日の景色の著作権表示（利用規約：壁紙利用限定）
        if current_member.bg_mode == "bing" and wallpaper and wallpaper.copyright:
            st.caption(f"© {wallpaper.copyright}")

    # 3. ページ上部に高さ 64px の上部バーを描画（アプリ名・ヘルプ・アバターポップオーバー）
    render_top_bar(current_member, lang, repo)

    # 4. 選択されたページの実行
    nav.run()


if __name__ == "__main__":
    main()
