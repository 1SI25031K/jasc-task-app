"""ホーム（あいさつ画面）。ログイン直後に表示される、Google アカウント管理風のポータル画面。"""

from __future__ import annotations

import html
import streamlit as st

from core.i18n import t
from core.services import build_home_summary, get_greeting_key, get_home_alerts
from core.session import (
    get_current_member,
    get_lang,
    get_now,
    get_repo,
    get_today,
)
from core.ui.avatar import render_avatar

repo = get_repo()
lang = get_lang()
today = get_today()
now = get_now()
current_member = get_current_member()

tasks = repo.list_tasks(include_archived=False)
checkins = repo.list_checkins()

member_name = current_member.get_name(lang)
greeting_key = get_greeting_key(now)
greeting_tmpl = t(f"home.greeting_{greeting_key}", lang)
greeting_text = greeting_tmpl.format(name=member_name)
summary_text = build_home_summary(current_member.member_id, tasks, today, lang)

if "dismissed_home_alerts" not in st.session_state:
    st.session_state["dismissed_home_alerts"] = set()

# CSS：中央寄せ・ピル型検索バー・Google風チップ・カード装飾（ライト / ダーク両対応）
st.html(
    """
<style>
.st-key-home_search_box input {
    border-radius: 28px !important;
    padding: 14px 24px !important;
    height: 48px !important;
    font-size: 1rem !important;
    border: 1px solid #c4c7c5 !important;
    background-color: #ffffff !important;
    color: #1f1f1f !important;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08) !important;
    transition: box-shadow 0.2s ease, border-color 0.2s ease !important;
}
.st-key-home_search_box input:focus {
    border-color: #0b57d0 !important;
    box-shadow: 0 2px 6px rgba(11, 87, 208, 0.2) !important;
}
/* Google アカウント風の横並びアクションチップ（文字あふれ防止） */
div[class*="st-key-home_chip_"] button {
    border-radius: 8px !important;
    border: 1px solid #747775 !important;
    background-color: transparent !important;
    color: #1f1f1f !important;
    font-size: 0.8125rem !important;
    font-weight: 500 !important;
    padding: 6px 4px !important;
    min-height: 38px !important;
    box-shadow: none !important;
    white-space: nowrap !important;
    transition: background-color 0.15s ease, border-color 0.15s ease !important;
}
div[class*="st-key-home_chip_"] button:hover {
    background-color: rgba(11, 87, 208, 0.08) !important;
    border-color: #0b57d0 !important;
    color: #0b57d0 !important;
}
/* Google アカウント風のお知らせカード内ボタン（Dismiss: テキスト, Open: 塗りつぶしピル） */
div[class*="st-key-dismiss_"] button {
    border: none !important;
    background-color: transparent !important;
    color: #0b57d0 !important;
    font-weight: 600 !important;
    box-shadow: none !important;
    border-radius: 20px !important;
}
div[class*="st-key-dismiss_"] button:hover {
    background-color: rgba(11, 87, 208, 0.08) !important;
}
div[class*="st-key-open_"] button {
    border-radius: 20px !important;
    background-color: #0b57d0 !important;
    border: none !important;
    color: #ffffff !important;
    font-weight: 600 !important;
    padding: 6px 16px !important;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15) !important;
}
div[class*="st-key-open_"] button:hover {
    background-color: #0842a0 !important;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.25) !important;
}
.home-greeting {
    font-size: 1.85rem;
    font-weight: 600;
    margin: 0 0 8px 0;
    font-family: 'Google Sans Flex', 'Noto Sans JP', sans-serif;
    letter-spacing: -0.5px;
    color: #191c1e;
}
.home-summary {
    font-size: 0.9375rem;
    color: #5f6368;
    margin: 0;
    font-weight: 400;
}
.alert-card-title {
    font-size: 17px;
    font-weight: 500;
    color: #1F1F1F;
}
.alert-card-desc {
    font-size: 14px;
    color: #444746;
    margin: 0 0 16px 54px;
    line-height: 1.4;
}

/* ダークモード対応 */
@media (prefers-color-scheme: dark) {
    .home-greeting {
        color: #e1e2e5 !important;
    }
    .home-summary {
        color: #c4c7c5 !important;
    }
    .alert-card-title {
        color: #e1e2e5 !important;
    }
    .alert-card-desc {
        color: #c4c7c5 !important;
    }
    .st-key-home_search_box input {
        background-color: #1e2022 !important;
        color: #e1e2e5 !important;
        border-color: #41484d !important;
    }
    div[class*="st-key-home_chip_"] button {
        border-color: #8e9099 !important;
        color: #e1e2e5 !important;
    }
    div[class*="st-key-home_chip_"] button:hover {
        background-color: rgba(146, 204, 255, 0.12) !important;
        border-color: #92ccff !important;
        color: #92ccff !important;
    }
    div[class*="st-key-dismiss_"] button {
        color: #92ccff !important;
    }
    div[class*="st-key-dismiss_"] button:hover {
        background-color: rgba(146, 204, 255, 0.12) !important;
    }
    div[class*="st-key-open_"] button {
        background-color: #92ccff !important;
        color: #003355 !important;
    }
    div[class*="st-key-open_"] button:hover {
        background-color: #b8deff !important;
    }
}
</style>
"""
)

# 画面全体を中央寄せのコンテナで構成
_, col_center, _ = st.columns([1, 6, 1])

with col_center:
    # 1. 丸いアバター（名前の頭文字・ユーザー別カラー）
    render_avatar(member_name, current_member.member_id, size=88)

    # 2. 大きな文字のあいさつ
    safe_greeting = html.escape(greeting_text)
    safe_summary = html.escape(summary_text)
    st.html(
        f"""
    <div style="text-align: center; margin-bottom: 24px;">
        <h1 class="home-greeting">
            {safe_greeting}
        </h1>
        <p class="home-summary">
            {safe_summary}
        </p>
    </div>
    """
    )

    # 3. ピル型の大きな検索欄「タスク・NA を検索」
    with st.container():
        search_query = st.text_input(
            label="search",
            placeholder=f"🔍  {t('home.search_placeholder', lang)}",
            label_visibility="collapsed",
            key="home_search_box",
        )
        if search_query and search_query.strip():
            st.session_state["flt_kw"] = search_query.strip()
            st.switch_page("app_pages/all_tasks.py")

    st.html("<div style='height: 16px;'></div>")

    # 4. 角丸の枠線付きチップを横並び配置
    chip_cols = st.columns(5)
    chips = [
        (t("home.chip_my_tasks", lang), "app_pages/my_tasks.py", "chip_my_tasks"),
        (t("home.chip_alerts", lang), "app_pages/alerts.py", "chip_alerts"),
        (t("home.chip_inbox", lang), "app_pages/inbox.py", "chip_inbox"),
        (t("home.chip_checkin", lang), "app_pages/checkin.py", "chip_checkin"),
        (t("home.chip_minutes", lang), "app_pages/minutes.py", "chip_minutes"),
    ]
    for idx, (chip_label, target_page, chip_key) in enumerate(chips):
        with chip_cols[idx]:
            if st.button(
                chip_label,
                key=f"home_{chip_key}",
                width="stretch",
                type="secondary",
            ):
                st.switch_page(target_page)

    st.html("<div style='height: 24px;'></div>")

    # 5. お知らせカード（レコメンデーション）
    alerts = get_home_alerts(
        current_member.member_id,
        tasks,
        checkins,
        today,
        dismissed_types=st.session_state["dismissed_home_alerts"],
    )

    if alerts:
        alert_svg_uris = {
            "inbox": (
                "#FFDCC1",
                "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='22' height='22' viewBox='0 0 24 24' fill='%238B4A00'%3E%3Cpath d='M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5v-3h3.56c.69 1.19 1.97 2 3.44 2s2.75-.81 3.44-2H19v3zm0-5h-4.99c0 1.1-.9 2-2.01 2s-2.01-.9-2.01-2H5V5h14v9z'/%3E%3C/svg%3E",
            ),
            "checkin": (
                "#E9DDFF",
                "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='22' height='22' viewBox='0 0 24 24' fill='%236B4FBB'%3E%3Cpath d='M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z'/%3E%3C/svg%3E",
            ),
            "alerts": (
                "#FFD8E4",
                "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='22' height='22' viewBox='0 0 24 24' fill='%239C2A5C'%3E%3Cpath d='M22 5.72l-4.6-3.86-1.29 1.53 4.6 3.86L22 5.72zM7.88 3.39L6.6 1.86 2 5.71l1.29 1.53 4.59-3.85zM12.5 8H11v6l4.75 2.85.75-1.23-4-2.37V8zM12 4c-4.97 0-9 4.03-9 9 0 4.17 2.84 7.67 6.69 8.69L8.4 23.36l1.96.4 1.4-6.84c.08.01.16.03.24.03s.16-.02.24-.03l1.4 6.84 1.96-.4-1.29-1.67C18.16 20.67 21 17.17 21 13c0-4.97-4.03-9-9-9zm0 16c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z'/%3E%3C/svg%3E",
            ),
        }
        for alert in alerts:
            bg_col, img_uri = alert_svg_uris.get(
                alert.alert_type,
                (
                    "#D3E3FD",
                    "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='22' height='22' viewBox='0 0 24 24' fill='%230B57D0'%3E%3Cpath d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z'/%3E%3C/svg%3E",
                ),
            )
            with st.container(border=True):
                title_text = t(alert.title_key, lang, count=alert.count)
                desc_text = t(alert.desc_key, lang, count=alert.count)
                safe_title = html.escape(title_text)
                safe_desc = html.escape(desc_text)

                st.html(
                    f"""
                <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 8px;">
                    <div style="width: 40px; height: 40px; min-width: 40px; border-radius: 50%; background-color: {bg_col}; display: flex; align-items: center; justify-content: center;">
                        <img src="{img_uri}" width="22" height="22" alt="" style="display: block;">
                    </div>
                    <div class="alert-card-title">
                        {safe_title}
                    </div>
                </div>
                <div class="alert-card-desc">
                    {safe_desc}
                </div>
                """
                )

                btn_col_space, btn_col_dismiss, btn_col_open = st.columns(
                    [3.5, 1.2, 1.3]
                )
                with btn_col_dismiss:
                    if st.button(
                        t("home.dismiss_btn", lang),
                        key=f"dismiss_{alert.alert_type}",
                        type="secondary",
                    ):
                        st.session_state["dismissed_home_alerts"].add(
                            alert.alert_type
                        )
                        st.rerun()

                with btn_col_open:
                    if st.button(
                        t("home.open_btn", lang),
                        key=f"open_{alert.alert_type}",
                        type="primary",
                    ):
                        st.switch_page(alert.target_page)
