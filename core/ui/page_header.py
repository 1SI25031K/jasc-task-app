"""各画面共通のページヘッダー（見出し・サブタイトル・新しいタスク作成ボタン）描画モジュール。

仕様：
- 見出し：アイコンなし、Google Sans Flex 32px 400
- サブタイトル：14px 補助色、1行まで
- 右上：主要操作「新しいタスクを作成」ボタン（#0B57D0 塗りつぶしピル型）
- S6 準拠：完全 HTML エスケープ
"""

from __future__ import annotations

import html
import streamlit as st

from core.i18n import t
from core.models import LangCode
from core.session import open_create_task_dialog


def render_page_header(
    title: str,
    subtitle: str = "",
    lang: LangCode = "ja",
    show_new_task: bool = True,
    key_suffix: str = "",
) -> None:
    """各画面の上部にアイコンなし見出し、1行サブタイトル、右上タスク作成ボタンを描画する。"""
    safe_title = html.escape(title)
    safe_sub = html.escape(subtitle) if subtitle else ""

    col_heading, col_action = st.columns([7.0, 3.0], vertical_alignment="center")

    with col_heading:
        st.html(f'<h1 class="page-heading">{safe_title}</h1>')
        if safe_sub:
            st.html(f'<div class="page-subtitle">{safe_sub}</div>')
        else:
            st.html('<div style="height: 12px;"></div>')

    with col_action:
        if show_new_task:
            btn_key = f"page_new_task_btn_{key_suffix}" if key_suffix else "page_new_task_btn"
            if st.button(
                t("app.new_task_btn", lang),
                type="primary",
                key=btn_key,
            ):
                open_create_task_dialog()

