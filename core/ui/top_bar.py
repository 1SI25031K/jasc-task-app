"""Google アカウント管理画面風の上部バー（Top Bar）描画モジュール。

高さ 64px、背景色 #F0F4F9、下線なし。
左：アプリ名「JASC タスクマネージャー」
右：ヘルプアイコン、背景設定プレースホルダー（フェーズ 7.7 用）、ユーザーアバター
アバター押下時：st.popover により名前・メール・言語切替・ログアウトを表示。
"""

from __future__ import annotations

import html
import streamlit as st

from core.i18n import t
from core.models import LangCode, Member
from core.repository import Repository
from core.ui.avatar import get_avatar_color, get_initial, get_user_picture_url
from core.ui.background import BG_PALETTES, fetch_bing_today_wallpaper


def render_top_bar(current_member: Member, lang: LangCode, repo: Repository) -> None:
    """ページ最上部に高さ 64px の上部バーを描画する（S6 準拠）。"""
    user_name = current_member.get_name(lang)
    member_id = current_member.member_id
    initial_char = get_initial(user_name)
    avatar_bg = get_avatar_color(member_id)
    pic_url = get_user_picture_url()

    # アバター用ボタンスタイル（画像あり／なしの動的注入）
    bg_style = (
        f"background-image: url('{html.escape(pic_url)}'); background-size: cover; background-position: center;"
        if pic_url
        else f"background-color: {avatar_bg}; color: #ffffff;"
    )
    p_style = "display: none !important;" if pic_url else "color: #ffffff !important;"

    st.html(
        f"""
<style>
.st-key-topbar_user_popover div[data-testid="stPopover"] > button {{
    width: 40px !important;
    height: 40px !important;
    min-width: 40px !important;
    min-height: 40px !important;
    border-radius: 50% !important;
    padding: 0 !important;
    border: none !important;
    {bg_style}
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12) !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    cursor: pointer !important;
    transition: transform 0.15s ease, box-shadow 0.15s ease !important;
}}
.st-key-topbar_user_popover div[data-testid="stPopover"] > button:hover {{
    transform: scale(1.05) !important;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2) !important;
}}
.st-key-topbar_user_popover div[data-testid="stPopover"] > button p {{
    margin: 0 !important;
    line-height: 40px !important;
    font-size: 16px !important;
    font-weight: 500 !important;
    font-family: 'Google Sans Flex', 'Noto Sans JP', sans-serif !important;
    {p_style}
}}
.st-key-topbar_help_popover div[data-testid="stPopover"] > button {{
    width: 40px !important;
    height: 40px !important;
    min-width: 40px !important;
    min-height: 40px !important;
    border-radius: 50% !important;
    padding: 0 !important;
    border: none !important;
    background-color: transparent !important;
    color: #444746 !important;
    box-shadow: none !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
}}
.st-key-topbar_help_popover div[data-testid="stPopover"] > button:hover,
.st-key-topbar_bg_popover div[data-testid="stPopover"] > button:hover {{
    background-color: rgba(0, 0, 0, 0.06) !important;
}}
.st-key-topbar_bg_popover div[data-testid="stPopover"] > button {{
    width: 40px !important;
    height: 40px !important;
    min-width: 40px !important;
    min-height: 40px !important;
    border-radius: 50% !important;
    padding: 0 !important;
    border: none !important;
    background-color: transparent !important;
    color: #444746 !important;
    box-shadow: none !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
}}

/* 背景色選択スウォッチ（直径 32px） */
div[class*="st-key-bg_swatch_"] button {{
    width: 32px !important;
    height: 32px !important;
    min-width: 32px !important;
    min-height: 32px !important;
    border-radius: 50% !important;
    padding: 0 !important;
    margin: 0 auto !important;
    border: 1px solid rgba(0, 0, 0, 0.12) !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    font-size: 14px !important;
    transition: transform 0.15s ease, box-shadow 0.15s ease !important;
}}
div[class*="st-key-bg_swatch_"] button:hover {{
    transform: scale(1.1) !important;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2) !important;
}}
.st-key-bg_swatch_standard button, .st-key-bg_swatch_sel_standard button {{ background-color: #F0F4F9 !important; }}
.st-key-bg_swatch_blue button, .st-key-bg_swatch_sel_blue button {{ background-color: #E8F0FE !important; }}
.st-key-bg_swatch_teal button, .st-key-bg_swatch_sel_teal button {{ background-color: #E0F2F1 !important; }}
.st-key-bg_swatch_green button, .st-key-bg_swatch_sel_green button {{ background-color: #E6F4EA !important; }}
.st-key-bg_swatch_yellow button, .st-key-bg_swatch_sel_yellow button {{ background-color: #FEF7E0 !important; }}
.st-key-bg_swatch_orange button, .st-key-bg_swatch_sel_orange button {{ background-color: #FEEFE3 !important; }}
.st-key-bg_swatch_pink button, .st-key-bg_swatch_sel_pink button {{ background-color: #FCE8F0 !important; }}
.st-key-bg_swatch_purple button, .st-key-bg_swatch_sel_purple button {{ background-color: #F3E8FD !important; }}
.st-key-bg_swatch_gray button, .st-key-bg_swatch_sel_gray button {{ background-color: #F1F3F4 !important; }}

/* 選択中色の強調：青（#0B57D0）の輪とチェックマーク */
div[class*="st-key-bg_swatch_sel_"] button {{
    outline: 2px solid #0B57D0 !important;
    outline-offset: 2px !important;
    border: 1px solid transparent !important;
    color: #0B57D0 !important;
}}
</style>
"""
    )

    # 上部バーコンテナ（高さ 64px 相当・モバイルでも横並び維持）
    with st.container(key="top_bar_container"):
        col_title, col_help, col_bg, col_avatar = st.columns(
            [7.6, 0.8, 0.8, 0.8],
            vertical_alignment="center",
        )

        with col_title:
            app_title = t("app.title", lang)
            st.html(
                f'<div class="top-bar-title" style="padding: 12px 0 8px 0; font-size: 22px; font-weight: 400; font-family: \'Google Sans Flex\', sans-serif; color: #1F1F1F;">{html.escape(app_title)}</div>'
            )

        with col_help:
            with st.popover(
                "",
                icon=":material/help_outline:",
                help=t("app.help_title", lang) if lang == "en" else "ヘルプ・使い方",
                key="topbar_help_popover",
            ):
                st.markdown(f"#### :material/info: {t('app.title', lang)}")
                st.markdown(
                    "日米学生会議（JASC）実行委員会のためのタスク・NA管理アプリです。\n\n"
                    "- **ホーム**：毎日の状況確認と主要機能へのショートカット\n"
                    "- **役職ボード**：役職ごとの未完了タスクと最も期限の近いNAの把握\n"
                    "- **マイタスク**：自分のタスク・依頼のワンストップ管理\n"
                    "- **体感負荷**：1クリックでの余裕度チェックイン"
                    if lang == "ja"
                    else "Task & Next Action management app for the JASC Executive Committee.\n\n"
                    "- **Home**: Daily summary and shortcuts\n"
                    "- **Role Board**: Role-based task tracking\n"
                    "- **My Tasks**: Personal tasks and requests\n"
                    "- **Check-in**: 1-click workload recording"
                )

        with col_bg:
            # 背景設定ポップオーバー（フェーズ 7.7-C）
            with st.popover(
                "",
                icon=":material/wallpaper:",
                help=t("app.bg_settings", lang),
                key="topbar_bg_popover",
            ):
                st.markdown(f"#### {t('bg.heading', lang)}")

                # 9色の丸ボタン（32px）を横並びに配置
                swatch_cols = st.columns(9)
                palette_keys = [
                    "standard",
                    "blue",
                    "teal",
                    "green",
                    "yellow",
                    "orange",
                    "pink",
                    "purple",
                    "gray",
                ]
                for i, p_key in enumerate(palette_keys):
                    p_info = BG_PALETTES[p_key]
                    is_selected = (
                        current_member.bg_color == p_key
                        and current_member.bg_mode != "bing"
                    )
                    btn_key = (
                        f"bg_swatch_sel_{p_key}"
                        if is_selected
                        else f"bg_swatch_{p_key}"
                    )
                    btn_label = ":material/check:" if is_selected else ""
                    with swatch_cols[i]:
                        if st.button(
                            btn_label,
                            key=btn_key,
                            help=p_info["name_ja"] if lang == "ja" else p_info["name_en"],
                        ):
                            new_mode = "standard" if p_key == "standard" else "color"
                            current_member.bg_mode = new_mode
                            current_member.bg_color = p_key
                            repo.update_member_bg(
                                current_member.member_id, new_mode, p_key
                            )
                            st.rerun()

                st.divider()

                # 今日の景色スイッチ（Bing）
                is_bing_active = current_member.bg_mode == "bing"
                bing_toggle = st.toggle(
                    t("bg.bing_toggle", lang),
                    value=is_bing_active,
                    help=t("bg.bing_toggle_desc", lang),
                    key="topbar_bing_toggle",
                )
                st.caption(t("bg.bing_toggle_desc", lang))

                if bing_toggle != is_bing_active:
                    new_mode = (
                        "bing"
                        if bing_toggle
                        else (
                            "color"
                            if current_member.bg_color != "standard"
                            else "standard"
                        )
                    )
                    current_member.bg_mode = new_mode
                    repo.update_member_bg(
                        current_member.member_id, new_mode, current_member.bg_color
                    )
                    st.rerun()

                # Bing 取得失敗時の案内表示
                if current_member.bg_mode == "bing":
                    wp = fetch_bing_today_wallpaper()
                    if wp is None:
                        st.caption(f":material/info: {t('bg.bing_failed', lang)}")

        with col_avatar:
            # アバターボタン（押すとユーザー情報・言語切替・ログアウト）
            with st.popover(
                initial_char,
                help=user_name,
                key="topbar_user_popover",
            ):
                st.markdown(f"### {user_name}")
                st.caption(f":material/mail: {current_member.email}")
                st.divider()

                # 言語切替（サイドバーから移設）
                lang_options: list[LangCode] = ["ja", "en"]
                lang_labels = {"ja": "日本語", "en": "English"}
                selected_lang = st.radio(
                    t("app.lang_label", lang),
                    options=lang_options,
                    index=1 if lang == "en" else 0,
                    format_func=lambda code: lang_labels[code],
                    horizontal=True,
                    key="topbar_lang_radio",
                )
                if selected_lang != current_member.lang:
                    st.session_state["lang"] = selected_lang
                    current_member.lang = selected_lang
                    repo.update_member_lang(current_member.member_id, selected_lang)

                st.divider()
                if st.button(
                    f":material/logout: {t('app.logout_btn', lang)}",
                    key="topbar_logout_btn",
                    type="secondary",
                    use_container_width=True,
                ):
                    st.logout()
