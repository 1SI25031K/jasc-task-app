"""フェーズ7.5：M3 Expressive UI（テーマ、プログレスバー、ローディング、Google ログインボタン）の単体テスト。"""

from __future__ import annotations

import re
import tomllib
from pathlib import Path
from streamlit.testing.v1 import AppTest

from core.ui.google_signin import _GOOGLE_G_LOGO_SVG, _GOOGLE_SIGNIN_CSS, render_google_signin_button
from core.ui.loading import _M3_LOADING_CSS, m3_loading_indicator
from core.ui.progress import _M3_PROGRESS_CSS, m3_progress


def test_google_signin_button_branding_guidelines() -> None:
    """Google Sign-In ブランドガイドライン（公式4色SVG、高さ40px、枠線#747775、フォント）の準拠確認。"""
    # 1. 正規の 4 色 SVG パスが含まれていること
    assert "%23EA4335" in _GOOGLE_G_LOGO_SVG  # Red
    assert "%234285F4" in _GOOGLE_G_LOGO_SVG  # Blue
    assert "%23FBBC05" in _GOOGLE_G_LOGO_SVG  # Yellow
    assert "%2334A853" in _GOOGLE_G_LOGO_SVG  # Green

    # 2. CSS に規定のスタイル（高さ40px、ボーダー#747775、Google Sans Flex / Roboto）が含まれていること
    assert "height: 40px" in _GOOGLE_SIGNIN_CSS
    assert "#747775" in _GOOGLE_SIGNIN_CSS
    assert "Google Sans Flex" in _GOOGLE_SIGNIN_CSS
    assert "border-radius: 20px" in _GOOGLE_SIGNIN_CSS


def test_m3_progress_and_loading_keyframes_and_reduced_motion() -> None:
    """M3 プログレス・ローディングの CSS にキーフレームおよび prefers-reduced-motion が含まれていること。"""
    # 1. リニアプログレスバー
    assert "@keyframes m3-linear-primary" in _M3_PROGRESS_CSS
    assert "@keyframes m3-linear-secondary" in _M3_PROGRESS_CSS
    assert "@media (prefers-reduced-motion: reduce)" in _M3_PROGRESS_CSS
    assert "var(--primary-color" in _M3_PROGRESS_CSS

    # 2. M3 Expressive モーフィングローディング
    assert "@keyframes m3-expressive-morph" in _M3_LOADING_CSS
    assert "@media (prefers-reduced-motion: reduce)" in _M3_LOADING_CSS
    # Soft burst (polygon), Squircle, Pill, Circle を経由するモーフィング
    assert "border-radius" in _M3_LOADING_CSS or "clip-path" in _M3_LOADING_CSS


def test_no_raw_emojis_in_locales() -> None:
    """locales/ja.toml と locales/en.toml に一般的な絵文字が残っていないか検証。"""
    emoji_pattern = re.compile(
        r"[\U0001F300-\U0001F6FF]|[\U0001F900-\U0001F9FF]|[\U0001FA70-\U0001FAFF]|"
        r"[\u2600-\u26FF]|[\u2700-\u27BF]"
    )

    root_dir = Path(__file__).resolve().parent.parent
    for lang in ("ja", "en"):
        toml_path = root_dir / "locales" / f"{lang}.toml"
        assert toml_path.exists()
        with open(toml_path, "rb") as f:
            data = tomllib.load(f)

        def check_values(obj: dict | list | str, prefix: str = "") -> None:
            if isinstance(obj, dict):
                for k, v in obj.items():
                    check_values(v, f"{prefix}.{k}" if prefix else k)
            elif isinstance(obj, list):
                for item in obj:
                    check_values(item, prefix)
            elif isinstance(obj, str):
                # :material/xxx: は絵文字ではなくアイコン記法なので除外して検査
                text_without_material = re.sub(r":material/[a-z0-9_]+:", "", obj)
                matches = emoji_pattern.findall(text_without_material)
                assert (
                    not matches
                ), f"Found raw emoji(s) {matches} at {prefix} in {toml_path.name}"

        check_values(data)


def test_theme_config_m3_tokens() -> None:
    """.streamlit/config.toml に M3 Expressive のカラートークン、フォント、角丸が定義されていること。"""
    config_path = Path(__file__).resolve().parent.parent / ".streamlit" / "config.toml"
    assert config_path.exists()
    content = config_path.read_text(encoding="utf-8")

    assert "[theme]" in content
    assert "[theme.sidebar]" in content
    assert "Google Sans Flex" in content
    assert "Noto Sans JP" in content
    assert 'baseRadius = "12px"' in content
    assert 'buttonRadius = "20px"' in content
