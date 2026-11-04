"""Google アカウント管理画面風の丸型カラーアバター描画モジュール。

ログイン中の Google アカウントのアイコン画像（st.user.picture）を優先表示し、
取得できない場合（モック・ローカル時）はメンバー固有の M3 トナルカラー頭文字円形へ
安全にフォールバックします（S6 準拠・厳格エスケープ）。
"""

from __future__ import annotations

import hashlib
import html
import streamlit as st

# M3 トナルパレット
AVATAR_COLORS = [
    "#0B57D0",  # M3 Primary Blue
    "#006a6a",  # M3 Teal
    "#146C2E",  # M3 Forest Green
    "#8B4A00",  # M3 Warm Amber
    "#6B4FBB",  # M3 Purple
    "#904a43",  # M3 Rust Red
    "#006874",  # M3 Cyan
    "#9C2A5C",  # M3 Magenta
]


def get_user_picture_url() -> str | None:
    """ログイン中の Google アカウントのアイコン画像 URL を取得する（存在する場合）。"""
    try:
        if hasattr(st, "user") and st.user:
            pic = getattr(st.user, "picture", None)
            if not pic and hasattr(st.user, "get"):
                pic = st.user.get("picture")
            if pic and isinstance(pic, str) and (pic.startswith("http://") or pic.startswith("https://")):
                return pic
    except Exception:
        pass
    return None


def get_avatar_color(member_id: str) -> str:
    """member_id のハッシュ値から決定論的にアバター背景色を返す。"""
    if not member_id:
        return AVATAR_COLORS[0]
    h = int(hashlib.md5(member_id.encode("utf-8")).hexdigest(), 16)
    return AVATAR_COLORS[h % len(AVATAR_COLORS)]


def get_initial(name: str) -> str:
    """名前からアバター表示用の頭文字（1文字）を取得する。"""
    clean = name.strip()
    if not clean:
        return "J"
    first = clean[0]
    return first.upper() if first.isascii() else first


def build_avatar_html(
    name: str,
    member_id: str,
    size: int = 40,
    picture_url: str | None = None,
) -> str:
    """丸型アバターの HTML 文字列を生成する（S6 準拠・完全エスケープ）。"""
    pic = picture_url or get_user_picture_url()
    if pic:
        safe_url = html.escape(pic)
        return f"""<img src="{safe_url}" width="{size}" height="{size}" style="width: {size}px; height: {size}px; border-radius: 50%; object-fit: cover; display: inline-block; vertical-align: middle;" alt="avatar" />"""

    bg_color = get_avatar_color(member_id)
    initial_char = get_initial(name)
    safe_char = html.escape(initial_char)
    font_size = max(12, int(size * 0.45))

    return f"""<div style="width: {size}px; height: {size}px; min-width: {size}px; min-height: {size}px; border-radius: 50%; background-color: {bg_color}; color: #ffffff; display: inline-flex; align-items: center; justify-content: center; font-family: 'Google Sans Flex', 'Noto Sans JP', sans-serif; font-size: {font_size}px; font-weight: 500; user-select: none; vertical-align: middle;">{safe_char}</div>"""


def render_avatar(name: str, member_id: str, size: int = 80) -> None:
    """中央寄せの大きな丸型アバターを安全に描画する。"""
    avatar_elem = build_avatar_html(name, member_id, size=size)
    st.html(
        f"""
    <div style="display: flex; justify-content: center; align-items: center; width: 100%; margin: 8px 0 16px 0;">
        {avatar_elem}
    </div>
    """
    )
