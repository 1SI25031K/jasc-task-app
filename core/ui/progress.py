"""Material Design 3（M3）Progress Indicator モジュール。

スプレッドシートの読み込み・保存などの待機時間に、M3 標準の Linear Progress Indicator
（直線型・不確定インジケーター）を表示するコンテキストマネージャーを提供します。
"""

from __future__ import annotations

from contextlib import contextmanager
import html
from typing import Generator
import streamlit as st

_M3_PROGRESS_CSS = """
<style>
.m3-progress-container {
    width: 100%;
    margin: 8px 0 16px 0;
    padding: 4px 0;
}
.m3-progress-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.875rem;
    color: var(--text-color, #191c1e);
    margin-bottom: 6px;
    font-weight: 500;
}
.m3-linear-track {
    position: relative;
    width: 100%;
    height: 4px;
    background-color: rgba(0, 99, 155, 0.15);
    border-radius: 2px;
    overflow: hidden;
}
.m3-linear-bar-primary {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    background-color: var(--primary-color, #00639b);
    border-radius: 2px;
    animation: m3-linear-primary 2.1s cubic-bezier(0.65, 0.815, 0.735, 0.395) infinite;
}
.m3-linear-bar-secondary {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    background-color: var(--primary-color, #00639b);
    border-radius: 2px;
    animation: m3-linear-secondary 2.1s cubic-bezier(0.165, 0.84, 0.44, 1) 1.15s infinite;
}

@keyframes m3-linear-primary {
    0% {
        left: -35%;
        right: 100%;
    }
    60% {
        left: 100%;
        right: -90%;
    }
    100% {
        left: 100%;
        right: -90%;
    }
}

@keyframes m3-linear-secondary {
    0% {
        left: -200%;
        right: 100%;
    }
    60% {
        left: 107%;
        right: -8%;
    }
    100% {
        left: 107%;
        right: -8%;
    }
}

/* 視差効果の低減設定（prefers-reduced-motion） */
@media (prefers-reduced-motion: reduce) {
    .m3-linear-bar-primary,
    .m3-linear-bar-secondary {
        animation: none !important;
    }
    .m3-linear-bar-primary {
        left: 0% !important;
        right: 40% !important;
        animation: m3-reduced-fade 2s ease-in-out infinite !important;
    }
    .m3-linear-bar-secondary {
        display: none !important;
    }
}

@keyframes m3-reduced-fade {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 1.0; }
}
</style>
"""


def _render_m3_progress_html(label_text: str = "") -> str:
    """M3 Linear Progress Indicator の静的 HTML 文字列を返す。S6 準拠。"""
    safe_label = html.escape(label_text) if label_text else ""
    label_html = (
        f'<div class="m3-progress-label">:material/sync: {safe_label}</div>'
        if safe_label
        else ""
    )
    return f"""
{_M3_PROGRESS_CSS}
<div class="m3-progress-container">
    {label_html}
    <div class="m3-linear-track">
        <div class="m3-linear-bar-primary"></div>
        <div class="m3-linear-bar-secondary"></div>
    </div>
</div>
"""


@contextmanager
def m3_progress(text: str = "") -> Generator[None, None, None]:
    """スプレッドシート処理等の待機時間を M3 Linear Progress Indicator で表示する。"""
    placeholder = st.empty()
    placeholder.html(_render_m3_progress_html(text))
    try:
        yield
    finally:
        placeholder.empty()

