"""Google アカウント管理画面風の M3 統合スタイルシート（フェーズ 7.6-R）。

S6 準拠：動的なユーザーデータを含まない完全静的な CSS ルールのみを定義します。
"""

from __future__ import annotations

import streamlit as st

_GLOBAL_CSS = """
<style>
/* ==============================================================================
   1. 背景色と境界線の統一（ページ・サイドバー完全一致：#F0F4F9）
   ============================================================================== */
.stApp {
    background-color: #F0F4F9 !important;
}

section[data-testid="stSidebar"] {
    background-color: #F0F4F9 !important;
    border-right: none !important;
    box-shadow: none !important;
    min-width: 280px !important;
    max-width: 280px !important;
    width: 280px !important;
}

section[data-testid="stSidebar"] > div {
    background-color: #F0F4F9 !important;
    padding-top: 0.5rem !important;
    padding-left: 0.75rem !important;
    padding-right: 0.75rem !important;
}

/* Streamlit 標準ヘッダーを透明化し、独自上部バーとシームレスに結合 */
header[data-testid="stHeader"] {
    background-color: #F0F4F9 !important;
    border-bottom: none !important;
    height: 3.5rem !important;
}

/* ==============================================================================
   M3 Indeterminate Linear Progress Indicator（ブラウザ最上部固定・4px ピンク）
   ============================================================================== */
body:has([data-testid="stStatusWidget"])::before,
.stApp:has([data-testid="stStatusWidget"])::before {
    content: "" !important;
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    height: 4px !important;
    background-color: #FFD8E4 !important;
    z-index: 99999998 !important;
}

body:has([data-testid="stStatusWidget"])::after,
.stApp:has([data-testid="stStatusWidget"])::after {
    content: "" !important;
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    height: 4px !important;
    background-color: #E8467C !important;
    z-index: 99999999 !important;
    animation: m3-linear-progress-indeterminate 2.1s cubic-bezier(0.65, 0.815, 0.735, 0.395) infinite !important;
}

@keyframes m3-linear-progress-indeterminate {
    0% {
        left: -35%;
        right: 100%;
        width: 35%;
    }
    60% {
        left: 100%;
        right: -90%;
        width: 90%;
    }
    100% {
        left: 100%;
        right: -90%;
        width: 90%;
    }
}

/* 視差効果を減らす（prefers-reduced-motion）対応 */
@media (prefers-reduced-motion: reduce) {
    body:has([data-testid="stStatusWidget"])::after,
    .stApp:has([data-testid="stStatusWidget"])::after {
        animation: none !important;
        left: 0 !important;
        width: 100% !important;
    }
}

/* Streamlit 標準の右上の処理中アイコン（Running Man・スピナー）は非表示にし、最上部インジケーターに一本化 */
div[data-testid="stStatusWidget"] {
    visibility: hidden !important;
}

/* ==============================================================================
   2. 本文コンテナの最大幅（960px 中央寄せ）
   ============================================================================== */
.main .block-container {
    max-width: 960px !important;
    margin: 0 auto !important;
    padding-top: 0.5rem !important;
    padding-bottom: 3rem !important;
    padding-left: 1.5rem !important;
    padding-right: 1.5rem !important;
}

/* ==============================================================================
   3. カード（白 #FFFFFF、角丸 28px、枠線なし、影なし）
   ============================================================================== */
div[data-testid="stVerticalBlockBorderWrapper"] {
    background-color: #FFFFFF !important;
    border-radius: 28px !important;
    border: none !important;
    box-shadow: none !important;
    padding: 24px !important;
    margin-bottom: 16px !important;
    transition: box-shadow 0.2s ease !important;
}

/* ==============================================================================
   4. ナビゲーション（高さ 56px、ピル型選択、6色の色付き丸アイコン）
   ============================================================================== */
section[data-testid="stSidebar"] .stPageLink a {
    height: 56px !important;
    border-radius: 28px !important;
    padding: 8px 16px !important;
    display: flex !important;
    align-items: center !important;
    gap: 16px !important;
    font-family: 'Google Sans Flex', 'Noto Sans JP', sans-serif !important;
    font-size: 16px !important;
    font-weight: 400 !important;
    color: #1F1F1F !important;
    background-color: transparent !important;
    border: none !important;
    text-decoration: none !important;
    margin-bottom: 4px !important;
    transition: background-color 0.15s ease !important;
}

section[data-testid="stSidebar"] .stPageLink a:hover {
    background-color: #E1E5EA !important;
}

/* 選択中の項目（背景 #D3E3FD、太さ 500） */
section[data-testid="stSidebar"] .stPageLink a[aria-current="page"] {
    background-color: #D3E3FD !important;
    font-weight: 500 !important;
}

/* 丸アイコン共通（直径 40px、中のアイコン 24px） */
section[data-testid="stSidebar"] .stPageLink a span[data-testid="stIconMaterial"] {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    width: 40px !important;
    height: 40px !important;
    min-width: 40px !important;
    min-height: 40px !important;
    border-radius: 50% !important;
    font-size: 24px !important;
    transition: background-color 0.15s ease, color 0.15s ease !important;
}

/* 6色トナルパレット（青・紫・緑・オレンジ・ピンク・ティール）の交互割り当て */
div[class*="st-key-nav_item_1"] span[data-testid="stIconMaterial"],
div[class*="st-key-nav_active_item_1"] span[data-testid="stIconMaterial"] { background-color: #D3E3FD !important; color: #0B57D0 !important; }
div[class*="st-key-nav_item_2"] span[data-testid="stIconMaterial"],
div[class*="st-key-nav_active_item_2"] span[data-testid="stIconMaterial"] { background-color: #E9DDFF !important; color: #6B4FBB !important; }
div[class*="st-key-nav_item_3"] span[data-testid="stIconMaterial"],
div[class*="st-key-nav_active_item_3"] span[data-testid="stIconMaterial"] { background-color: #C4EED0 !important; color: #146C2E !important; }
div[class*="st-key-nav_item_4"] span[data-testid="stIconMaterial"],
div[class*="st-key-nav_active_item_4"] span[data-testid="stIconMaterial"] { background-color: #FFDCC1 !important; color: #8B4A00 !important; }
div[class*="st-key-nav_item_5"] span[data-testid="stIconMaterial"],
div[class*="st-key-nav_active_item_5"] span[data-testid="stIconMaterial"] { background-color: #FFD8E4 !important; color: #9C2A5C !important; }
div[class*="st-key-nav_item_6"] span[data-testid="stIconMaterial"],
div[class*="st-key-nav_active_item_6"] span[data-testid="stIconMaterial"] { background-color: #BDEBEA !important; color: #00696B !important; }
div[class*="st-key-nav_item_7"] span[data-testid="stIconMaterial"],
div[class*="st-key-nav_active_item_7"] span[data-testid="stIconMaterial"] { background-color: #D3E3FD !important; color: #0B57D0 !important; }
div[class*="st-key-nav_item_8"] span[data-testid="stIconMaterial"],
div[class*="st-key-nav_active_item_8"] span[data-testid="stIconMaterial"] { background-color: #E9DDFF !important; color: #6B4FBB !important; }
div[class*="st-key-nav_item_9"] span[data-testid="stIconMaterial"],
div[class*="st-key-nav_active_item_9"] span[data-testid="stIconMaterial"] { background-color: #C4EED0 !important; color: #146C2E !important; }
div[class*="st-key-nav_item_10"] span[data-testid="stIconMaterial"],
div[class*="st-key-nav_active_item_10"] span[data-testid="stIconMaterial"] { background-color: #FFDCC1 !important; color: #8B4A00 !important; }

/* 選択中項目のアイコン丸（塗りつぶし #0B57D0、アイコンは白） */
div[class*="st-key-nav_active_item_"] span[data-testid="stIconMaterial"],
section[data-testid="stSidebar"] div[class*="st-key-nav_item_"] a[aria-current="page"] span[data-testid="stIconMaterial"],
section[data-testid="stSidebar"] .stPageLink a[aria-current="page"] span[data-testid="stIconMaterial"] {
    background-color: #0B57D0 !important;
    color: #FFFFFF !important;
}

/* 選択中のナビゲーション項目（背景 #D3E3FD、太さ 500、ピル型） */
div[class*="st-key-nav_active_item_"] .stPageLink a,
section[data-testid="stSidebar"] .stPageLink a[aria-current="page"] {
    background-color: #D3E3FD !important;
    font-weight: 500 !important;
}

/* ==============================================================================
   5. ボタン仕様（主要操作は #0B57D0 塗りつぶしピル、補助操作はテキストボタン）
   ============================================================================== */
button[kind="primary"],
.stButton > button[type="primary"] {
    background-color: #0B57D0 !important;
    color: #FFFFFF !important;
    border-radius: 20px !important;
    height: 40px !important;
    padding: 0 24px !important;
    border: none !important;
    font-family: 'Google Sans Flex', 'Noto Sans JP', sans-serif !important;
    font-weight: 500 !important;
    font-size: 14px !important;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15) !important;
    transition: background-color 0.15s ease, box-shadow 0.15s ease !important;
}

button[kind="primary"]:hover,
.stButton > button[type="primary"]:hover {
    background-color: #0842A0 !important;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.25) !important;
}

button[kind="secondary"],
.stButton > button[type="secondary"] {
    background-color: transparent !important;
    color: #0B57D0 !important;
    border: none !important;
    font-family: 'Google Sans Flex', 'Noto Sans JP', sans-serif !important;
    font-weight: 500 !important;
    font-size: 14px !important;
    border-radius: 20px !important;
    box-shadow: none !important;
    padding: 0 16px !important;
    transition: background-color 0.15s ease !important;
}

button[kind="secondary"]:hover,
.stButton > button[type="secondary"]:hover {
    background-color: rgba(11, 87, 208, 0.08) !important;
}

/* ==============================================================================
   6. 見出し・サブタイトル（Google Sans Flex 32px 400、アイコンなし）
   ============================================================================== */
.page-heading {
    font-family: 'Google Sans Flex', 'Noto Sans JP', sans-serif !important;
    font-size: 32px !important;
    font-weight: 400 !important;
    color: #1F1F1F !important;
    margin: 0 0 4px 0 !important;
    line-height: 1.25 !important;
    letter-spacing: -0.5px !important;
}

.page-subtitle {
    font-family: 'Google Sans Flex', 'Noto Sans JP', sans-serif !important;
    font-size: 14px !important;
    color: #444746 !important;
    margin: 0 0 20px 0 !important;
    line-height: 1.4 !important;
}

/* ==============================================================================
   7. 上部バー（高さ 64px、タイトル 22px 400、アバターボタン）
   ============================================================================== */
.top-bar-container {
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 8px;
    margin-bottom: 8px;
    background-color: #F0F4F9;
}

.top-bar-title {
    font-family: 'Google Sans Flex', 'Noto Sans JP', sans-serif;
    font-size: 22px;
    font-weight: 400;
    color: #1F1F1F;
    letter-spacing: -0.25px;
}

/* スマホでも上部バーのアイコン横並びを崩さない */
div[class*="st-key-top_bar_container"] div[data-testid="stHorizontalBlock"] {
    display: flex !important;
    flex-direction: row !important;
    align-items: center !important;
    flex-wrap: nowrap !important;
    gap: 8px !important;
}

@media (max-width: 640px) {
    .top-bar-title {
        font-size: 18px !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
    }
}

/* アバターポップオーバートリガーボタン（40px 丸型） */
div[data-testid="stPopover"] button {
    border-radius: 50% !important;
    padding: 0 !important;
    min-width: 40px !important;
    width: 40px !important;
    height: 40px !important;
    border: none !important;
    background-color: transparent !important;
    box-shadow: none !important;
}

div[data-testid="stPopover"] button:hover {
    background-color: rgba(0, 0, 0, 0.06) !important;
}

/* タブのアクティブ色 */
button[data-baseweb="tab"][aria-selected="true"] {
    color: #0B57D0 !important;
    border-bottom-color: #0B57D0 !important;
}
div[data-baseweb="tab-highlight"] {
    background-color: #0B57D0 !important;
}

/* ==============================================================================
   7.5. リスト・Expander（Google アカウント風の区切り線リスト）
   ============================================================================== */
[data-testid="stExpander"] {
    background-color: #FFFFFF !important;
    border: none !important;
    border-bottom: 1px solid #C4C7C5 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    margin: 0 !important;
}

[data-testid="stExpander"]:last-of-type {
    border-bottom: none !important;
}

[data-testid="stExpander"] summary,
[data-testid="stExpanderToggle"] {
    padding: 12px 16px !important;
    min-height: 48px !important;
    border-radius: 0 !important;
    font-family: 'Google Sans Flex', 'Noto Sans JP', sans-serif !important;
    font-size: 15px !important;
    font-weight: 500 !important;
    color: #1F1F1F !important;
    transition: background-color 0.15s ease !important;
}

[data-testid="stExpander"] summary:hover,
[data-testid="stExpanderToggle"]:hover {
    background-color: #F8FAFD !important;
}

div[data-testid="stExpanderDetails"] {
    padding: 16px 20px 24px 20px !important;
    background-color: #FFFFFF !important;
    border-top: 1px solid #F0F4F9 !important;
}

/* サイドバー最下部のリンク */
.sidebar-footer-links {
    margin-top: 32px;
    padding: 16px 8px;
    font-size: 14px;
    color: #444746;
    line-height: 1.6;
}

.sidebar-footer-links a {
    color: #444746 !important;
    text-decoration: none !important;
}

.sidebar-footer-links a:hover {
    color: #0B57D0 !important;
    text-decoration: underline !important;
}

/* ==============================================================================
   8. ダークモード対応
   ============================================================================== */
@media (prefers-color-scheme: dark) {
    .stApp,
    section[data-testid="stSidebar"],
    section[data-testid="stSidebar"] > div,
    header[data-testid="stHeader"],
    .top-bar-container {
        background-color: #111315 !important;
    }

    div[data-testid="stVerticalBlockBorderWrapper"] {
        background-color: #1E2022 !important;
    }

    [data-testid="stExpander"],
    div[data-testid="stExpanderDetails"] {
        background-color: #1E2022 !important;
        border-bottom-color: #444746 !important;
    }

    [data-testid="stExpander"] summary,
    [data-testid="stExpanderToggle"] {
        color: #E1E2E5 !important;
    }

    [data-testid="stExpander"] summary:hover,
    [data-testid="stExpanderToggle"]:hover {
        background-color: #282A2D !important;
    }

    .page-heading,
    .top-bar-title {
        color: #E1E2E5 !important;
    }

    .page-subtitle,
    .sidebar-footer-links,
    .sidebar-footer-links a {
        color: #8E9099 !important;
    }

    section[data-testid="stSidebar"] .stPageLink a {
        color: #E1E2E5 !important;
    }

    section[data-testid="stSidebar"] .stPageLink a:hover {
        background-color: #282A2D !important;
    }

    div[class*="st-key-nav_active_item_"] .stPageLink a,
    section[data-testid="stSidebar"] .stPageLink a[aria-current="page"] {
        background-color: #004A77 !important;
        color: #C2E7FF !important;
    }

    div[class*="st-key-nav_active_item_"] span[data-testid="stIconMaterial"],
    section[data-testid="stSidebar"] .stPageLink a[aria-current="page"] span[data-testid="stIconMaterial"] {
        background-color: #92CCFF !important;
        color: #003355 !important;
    }

    button[kind="primary"],
    .stButton > button[type="primary"] {
        background-color: #92CCFF !important;
        color: #003355 !important;
    }

    button[kind="primary"]:hover,
    .stButton > button[type="primary"]:hover {
        background-color: #B8DEFF !important;
    }

    button[kind="secondary"],
    .stButton > button[type="secondary"] {
        color: #92CCFF !important;
    }

    button[kind="secondary"]:hover,
    .stButton > button[type="secondary"]:hover {
        background-color: rgba(146, 204, 255, 0.12) !important;
    }
}

/* ==============================================================================
   エラー・例外・通知メッセージ内の長大URL・テキストの自動折り返し（横あふれ防止）
   ============================================================================== */
[data-testid="stNotification"],
[data-testid="stException"],
[data-testid="stAlert"] {
    overflow-wrap: anywhere !important;
    word-break: break-word !important;
}

[data-testid="stNotification"] code,
[data-testid="stException"] code,
[data-testid="stAlert"] code,
[data-testid="stNotification"] pre,
[data-testid="stException"] pre,
[data-testid="stAlert"] pre {
    white-space: pre-wrap !important;
    word-break: break-all !important;
    overflow-x: auto !important;
}
</style>
"""


def apply_global_styles() -> None:
    """全画面共通の Google アカウント管理風 CSS を注入する（S6 準拠）。"""
    st.html(_GLOBAL_CSS)
