"""フェーズ 7.7-C：背景設定および Bing 壁紙の単体テスト。

外部通信を行わず（unittest.mock）、ID 検証・フォールバック・キャッシュ・後方互換性を検証します。
"""

from __future__ import annotations

from datetime import datetime, timezone, timedelta
import json
from unittest.mock import MagicMock, patch
import urllib.error

from core.models import JST, Member
from core.repository import InMemoryRepository
from core.sheets_repository import row_to_member
from core.ui.background import (
    clear_bing_cache,
    fetch_bing_today_wallpaper,
    generate_background_css,
    validate_bing_image_id,
    BingWallpaperInfo,
)


def test_validate_bing_image_id() -> None:
    """Bing 画像 ID の厳格な正規表現検証をテストする（S6 準拠）。"""
    # 正常な ID
    assert validate_bing_image_id("OHR.SomeIsland_JA-JP1234567890") == "OHR.SomeIsland_JA-JP1234567890"
    assert validate_bing_image_id("photo_123.jpg") == "photo_123.jpg"
    assert validate_bing_image_id("ABC-def_123.456") == "ABC-def_123.456"

    # 不正な ID（記号・空白・URL・インジェクション試行）
    assert validate_bing_image_id("") is None
    assert validate_bing_image_id("   ") is None
    assert validate_bing_image_id("id with spaces") is None
    assert validate_bing_image_id("photo' OR '1'='1") is None
    assert validate_bing_image_id('photo"test') is None
    assert validate_bing_image_id("photo;background:red") is None
    assert validate_bing_image_id("https://evil.com/img.jpg") is None
    assert validate_bing_image_id("<script>alert(1)</script>") is None


def test_fetch_bing_today_wallpaper_success_and_cache() -> None:
    """Bing API からの正常取得と JST 日付キャッシュの動作を確認する。"""
    clear_bing_cache()

    dummy_response = {
        "images": [
            {
                "urlbase": "/th?id=OHR.MountFuji_JA-JP9876543210",
                "copyright": "Mount Fuji, Japan (© Dummy Photographer)",
            }
        ]
    }
    dummy_bytes = json.dumps(dummy_response).encode("utf-8")

    mock_resp = MagicMock()
    mock_resp.status = 200
    mock_resp.read.return_value = dummy_bytes
    mock_resp.__enter__.return_value = mock_resp

    with patch("urllib.request.urlopen", return_value=mock_resp) as mock_urlopen:
        wp = fetch_bing_today_wallpaper()
        assert wp is not None
        assert wp.image_id == "OHR.MountFuji_JA-JP9876543210"
        assert "https://www.bing.com/th?id=OHR.MountFuji_JA-JP9876543210_1920x1080.jpg" in wp.image_url
        assert "Mount Fuji" in wp.copyright
        assert mock_urlopen.call_count == 1

        # 2回目の呼び出し（同日）ではキャッシュが使用され、外部通信は行われない
        wp_cached = fetch_bing_today_wallpaper()
        assert wp_cached == wp
        assert mock_urlopen.call_count == 1


def test_fetch_bing_today_wallpaper_network_failure_fallback() -> None:
    """通信失敗時（タイムアウト・HTTPエラー等）に例外を出さず安全に None を返すことを確認する。"""
    clear_bing_cache()

    with patch("urllib.request.urlopen", side_effect=urllib.error.URLError("Connection timed out")):
        wp = fetch_bing_today_wallpaper(timeout=0.1)
        assert wp is None  # サイレントフォールバック


def test_generate_background_css() -> None:
    """背景 CSS 生成関数が指定色および Bing 画像を正しく反映することを確認する。"""
    # 1. 通常カラー
    css_blue = generate_background_css("color", "blue")
    assert "#E8F0FE" in css_blue

    # 2. Bing モード（正常壁紙あり）
    wp = BingWallpaperInfo(
        image_id="OHR.TestImg_JA-JP123",
        image_url="https://www.bing.com/th?id=OHR.TestImg_JA-JP123_1920x1080.jpg",
        copyright="Test (© Author)",
        fetch_date="2026-11-04",
    )
    css_bing = generate_background_css("bing", "standard", wp)
    assert "url('https://www.bing.com/th?id=OHR.TestImg_JA-JP123_1920x1080.jpg')" in css_bing
    assert "backdrop-filter: blur(12px)" in css_bing

    # 3. Bing モード（取得失敗時：wallpaper is None）→ 選択色へフォールバック
    css_fallback = generate_background_css("bing", "teal", None)
    assert "#E0F2F1" in css_fallback


def test_member_repository_background_backward_compatibility() -> None:
    """列が存在しない古いスプレッドシートの行辞書でも 'standard' で例外なく復元され、更新できることを確認する。"""
    old_row_dict = {
        "member_id": "m001",
        "display_name": "メンバーA",
        "display_name_en": "Member A",
        "email": "member_a@example.com",
        "main_roles": "r_chair",
        "lang": "ja",
        "slack_user_id": "",
        "reminders_enabled": "TRUE",
        "is_admin": "TRUE",
        "active": "TRUE",
        # bg_mode, bg_color 列がない！
    }
    member = row_to_member(old_row_dict)
    assert member.bg_mode == "standard"
    assert member.bg_color == "standard"

    # InMemoryRepository での背景更新
    repo = InMemoryRepository([member], [], [], [], [], [], [])
    repo.update_member_bg("m001", "color", "pink")
    updated = repo.get_member_by_email("member_a@example.com")
    assert updated is not None
    assert updated.bg_mode == "color"
    assert updated.bg_color == "pink"

