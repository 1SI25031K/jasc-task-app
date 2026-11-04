"""背景設定および「今日の景色（Bing Wallpaper）」管理モジュール（フェーズ 7.7）。

S6 準拠：外部APIの文字列を直接 HTML/CSS に埋め込まず、正規表現による厳格な検証を行います。
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import json
import re
import urllib.request
from typing import Any

import streamlit as st

from core.models import JST

# 9色の定義（標準 + 8色）
BG_PALETTES: dict[str, dict[str, str]] = {
    "standard": {"hex": "#F0F4F9", "name_ja": "標準", "name_en": "Standard"},
    "blue": {"hex": "#E8F0FE", "name_ja": "ブルー", "name_en": "Blue"},
    "teal": {"hex": "#E0F2F1", "name_ja": "ティール", "name_en": "Teal"},
    "green": {"hex": "#E6F4EA", "name_ja": "グリーン", "name_en": "Green"},
    "yellow": {"hex": "#FEF7E0", "name_ja": "イエロー", "name_en": "Yellow"},
    "orange": {"hex": "#FEEFE3", "name_ja": "オレンジ", "name_en": "Orange"},
    "pink": {"hex": "#FCE8F0", "name_ja": "ピンク", "name_en": "Pink"},
    "purple": {"hex": "#F3E8FD", "name_ja": "パープル", "name_en": "Purple"},
    "gray": {"hex": "#F1F3F4", "name_ja": "グレー", "name_en": "Gray"},
}

_BING_API_URL = "https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=ja-JP"
_BING_ID_REGEX = re.compile(r"^[A-Za-z0-9_.\-]+$")

# 日付ごとのキャッシュ辞書 { "YYYY-MM-DD": BingWallpaperInfo }
_BING_DAILY_CACHE: dict[str, BingWallpaperInfo | None] = {}


@dataclass
class BingWallpaperInfo:
    """Bing HPImageArchive から取得・検証済みの壁紙情報。"""

    image_id: str
    image_url: str
    copyright: str
    fetch_date: str


def validate_bing_image_id(raw_id: str) -> str | None:
    """Bing 画像IDを厳格に検証する。英数字・ハイフン・アンダースコア・ドットのみ許可し、想定外の文字があれば None を返す。"""
    clean_id = raw_id.strip()
    if not clean_id:
        return None
    if _BING_ID_REGEX.fullmatch(clean_id):
        return clean_id
    return None


def fetch_bing_today_wallpaper(timeout: float = 3.0) -> BingWallpaperInfo | None:
    """Bing HPImageArchive から本日の画像を取得する。

    JST 日付単位でキャッシュし、1日1回程度のアクセスに抑制する。
    通信失敗・タイムアウト・ID不正時は例外を外に出さず None を返す（サイレントフォールバック）。
    """
    today_str = datetime.now(JST).date().isoformat()
    if today_str in _BING_DAILY_CACHE:
        return _BING_DAILY_CACHE[today_str]

    try:
        req = urllib.request.Request(
            _BING_API_URL,
            headers={"User-Agent": "JASC-TaskManager/1.0"},
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status != 200:
                _BING_DAILY_CACHE[today_str] = None
                return None
            data = json.loads(resp.read().decode("utf-8"))

        images = data.get("images")
        if not images or not isinstance(images, list):
            _BING_DAILY_CACHE[today_str] = None
            return None

        img_data = images[0]
        # urlbase (例: /th?id=OHR.SomePlace_JA-JP1234567890) から ID 部分を抽出
        urlbase = str(img_data.get("urlbase", ""))
        raw_id = ""
        if "id=" in urlbase:
            raw_id = urlbase.split("id=")[-1]
        elif "/" in urlbase:
            raw_id = urlbase.split("/")[-1]
        else:
            raw_id = urlbase

        safe_id = validate_bing_image_id(raw_id)
        if not safe_id:
            _BING_DAILY_CACHE[today_str] = None
            return None

        # サーバー側で安全に URL を組み立てる
        image_url = f"https://www.bing.com/th?id={safe_id}_1920x1080.jpg"
        copyright_text = str(img_data.get("copyright", "")).strip()

        info = BingWallpaperInfo(
            image_id=safe_id,
            image_url=image_url,
            copyright=copyright_text,
            fetch_date=today_str,
        )
        _BING_DAILY_CACHE[today_str] = info
        return info
    except Exception:
        # 通信例外・タイムアウト時は安全に None を返す
        _BING_DAILY_CACHE[today_str] = None
        return None


def clear_bing_cache() -> None:
    """キャッシュをクリアする（テスト用）。"""
    _BING_DAILY_CACHE.clear()


def generate_background_css(
    bg_mode: str,
    bg_color: str,
    wallpaper: BingWallpaperInfo | None = None,
) -> str:
    """現在の背景設定に応じた CSS 文字列を生成する（S6 準拠）。"""
    # 1. 今日の景色（Bing Wallpaper）モードかつ取得成功の場合
    if bg_mode == "bing" and wallpaper is not None:
        safe_url = wallpaper.image_url  # validate_bing_image_id 済み
        return f"""
<style>
.stApp {{
    background: linear-gradient(rgba(0, 0, 0, 0.15), rgba(0, 0, 0, 0.15)), url('{safe_url}') no-repeat center center fixed !important;
    background-size: cover !important;
}}
section[data-testid="stSidebar"],
section[data-testid="stSidebar"] > div,
header[data-testid="stHeader"] {{
    background-color: rgba(255, 255, 255, 0.85) !important;
    backdrop-filter: blur(12px) !important;
    -webkit-backdrop-filter: blur(12px) !important;
}}
div[data-testid="stVerticalBlockBorderWrapper"] {{
    background-color: #FFFFFF !important;
}}
@media (prefers-color-scheme: dark) {{{{
    section[data-testid="stSidebar"],
    section[data-testid="stSidebar"] > div,
    header[data-testid="stHeader"] {{{{
        background-color: rgba(30, 32, 34, 0.85) !important;
    }}}}
    div[data-testid="stVerticalBlockBorderWrapper"] {{{{
        background-color: #1E2022 !important;
    }}}}
}}}}
</style>
"""

    # 2. 単色カラーモード（または standard、Bing 取得失敗フォールバック）
    palette = BG_PALETTES.get(bg_color) or BG_PALETTES["standard"]
    hex_color = palette["hex"]
    return f"""
<style>
.stApp {{
    background-color: {hex_color} !important;
}}
section[data-testid="stSidebar"],
section[data-testid="stSidebar"] > div,
header[data-testid="stHeader"] {{
    background-color: {hex_color} !important;
}}
div[data-testid="stVerticalBlockBorderWrapper"] {{
    background-color: #FFFFFF !important;
}}
@media (prefers-color-scheme: dark) {{{{
    .stApp,
    section[data-testid="stSidebar"],
    section[data-testid="stSidebar"] > div,
    header[data-testid="stHeader"] {{{{
        background-color: #141618 !important;
    }}}}
    div[data-testid="stVerticalBlockBorderWrapper"] {{{{
        background-color: #1E2022 !important;
    }}}}
}}}}
</style>
"""

