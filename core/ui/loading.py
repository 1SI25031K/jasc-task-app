"""Material Design 3（M3 Expressive）Loading Indicator モジュール。

AI（Gemini）での NA 候補生成中（F14）に表示する、M3 Expressive 特有の
形状変形（シェイプモーフィング）アニメーションを提供します。
OS の「視差効果を減らす」（prefers-reduced-motion）設定にも対応します。
"""

from __future__ import annotations

from contextlib import contextmanager
import html
from typing import Generator
import streamlit as st

_M3_LOADING_CSS = """
<style>
.m3-loading-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px 16px;
    margin: 16px 0;
    gap: 16px;
    background-color: var(--secondary-background-color, #f1f3f8);
    border-radius: 16px;
    border: 1px solid rgba(0, 99, 155, 0.15);
}
.m3-morphing-shape {
    width: 48px;
    height: 48px;
    background-color: var(--primary-color, #00639b);
    animation: m3-expressive-morph 3.6s cubic-bezier(0.34, 1.56, 0.64, 1) infinite;
    display: flex;
    align-items: center;
    justify-content: center;
}
.m3-loading-text {
    font-size: 0.9375rem;
    font-weight: 500;
    color: var(--text-color, #191c1e);
    letter-spacing: 0.2px;
}

/* M3 Expressive Morphing Animation: Soft Burst -> Squircle -> Pill -> Polygon -> Circle */
@keyframes m3-expressive-morph {
    0% {
        border-radius: 50%;
        transform: rotate(0deg) scale(1);
    }
    20% {
        border-radius: 20% 80% 30% 70% / 70% 30% 70% 30%;
        transform: rotate(72deg) scale(1.05);
    }
    40% {
        border-radius: 12px;
        transform: rotate(144deg) scale(0.95);
    }
    60% {
        border-radius: 24px 8px 24px 8px;
        transform: rotate(216deg) scale(1.08);
    }
    80% {
        border-radius: 8px 24px 8px 24px;
        transform: rotate(288deg) scale(0.98);
    }
    100% {
        border-radius: 50%;
        transform: rotate(360deg) scale(1);
    }
}

/* 視差効果の低減設定（prefers-reduced-motion）対応 */
@media (prefers-reduced-motion: reduce) {
    .m3-morphing-shape {
        animation: m3-reduced-pulse 2s ease-in-out infinite !important;
        transform: none !important;
        border-radius: 16px !important;
    }
}

@keyframes m3-reduced-pulse {
    0%, 100% {
        opacity: 0.5;
        transform: scale(0.96);
    }
    50% {
        opacity: 1.0;
        transform: scale(1.0);
    }
}
</style>
"""


def _render_m3_loading_html(label_text: str = "") -> str:
    """M3 Expressive Loading Indicator の静的 HTML 文字列を返す。S6 準拠。"""
    safe_label = html.escape(label_text) if label_text else ""
    label_html = (
        f'<div class="m3-loading-text">{safe_label}</div>'
        if safe_label
        else ""
    )
    return f"""
{_M3_LOADING_CSS}
<div class="m3-loading-wrapper">
    <div class="m3-morphing-shape"></div>
    {label_html}
</div>
"""


@contextmanager
def m3_loading_indicator(text: str = "") -> Generator[None, None, None]:
    """AI 生成待機時間を M3 Expressive Morphing Loading Indicator で表示する。"""
    placeholder = st.empty()
    placeholder.html(_render_m3_loading_html(text))
    try:
        yield
    finally:
        placeholder.empty()

