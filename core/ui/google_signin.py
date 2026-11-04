"""Sign in with Google Branding Guidelines 準拠ログインボタンモジュール。

公式アセット（assets_src/google_signin/）および Google のブランドガイドライン
（ロゴ改変禁止・規定サイズ40px・フォント・配色）に厳格に準拠し、クリックで
Streamlit のネイティブ認証 `st.login("google")` を実行します。
"""

from __future__ import annotations

import streamlit as st

from core.i18n import t
from core.models import LangCode

# Google 公式 4 色 G ロゴ（正規 SVG ベクター）
_GOOGLE_G_LOGO_SVG = (
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E"
    "%3Cpath fill='%23EA4335' d='M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z'/%3E"
    "%3Cpath fill='%234285F4' d='M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z'/%3E"
    "%3Cpath fill='%23FBBC05' d='M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z'/%3E"
    "%3Cpath fill='%2334A853' d='M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z'/%3E"
    "%3C/svg%3E"
)

_GOOGLE_SIGNIN_CSS = f"""
<style>
.st-key-google_signin_btn button {{
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    height: 40px !important;
    min-height: 40px !important;
    padding: 0 20px 0 12px !important;
    border-radius: 20px !important;
    border: 1px solid #747775 !important;
    background-color: #ffffff !important;
    color: #1f1f1f !important;
    font-family: 'Google Sans Flex', Roboto, arial, sans-serif !important;
    font-size: 14px !important;
    font-weight: 500 !important;
    letter-spacing: 0.25px !important;
    box-shadow: none !important;
    transition: background-color 0.2s ease, box-shadow 0.2s ease !important;
    cursor: pointer !important;
}}
.st-key-google_signin_btn button:hover {{
    background-color: #f8f9fa !important;
    border-color: #747775 !important;
    box-shadow: 0 1px 2px rgba(60,64,67,0.3), 0 1px 3px 1px rgba(60,64,67,0.15) !important;
}}
.st-key-google_signin_btn button:active {{
    background-color: #f1f3f4 !important;
}}
.st-key-google_signin_btn button::before {{
    content: "" !important;
    display: inline-block !important;
    width: 20px !important;
    height: 20px !important;
    margin-right: 12px !important;
    background-image: url("{_GOOGLE_G_LOGO_SVG}") !important;
    background-size: contain !important;
    background-repeat: no-repeat !important;
    background-position: center !important;
}}
.st-key-google_signin_btn button p {{
    color: #1f1f1f !important;
    margin: 0 !important;
    font-family: 'Google Sans Flex', Roboto, arial, sans-serif !important;
    font-size: 14px !important;
    font-weight: 500 !important;
    letter-spacing: 0.25px !important;
}}
</style>
"""


def render_google_signin_button(lang: LangCode = "ja") -> bool:
    """Google 規定のブランドガイドラインに準拠したログインボタンを描画し、押下時に st.login('google') を呼ぶ。"""
    st.html(_GOOGLE_SIGNIN_CSS)
    label = t("auth.login_btn", lang)
    clicked = st.button(
        label,
        key="google_signin_btn",
        type="secondary",
        width="content",
    )
    if clicked:
        st.login("google")
    return clicked
