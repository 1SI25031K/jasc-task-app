"""フェーズ0〜2の疎通確認テスト（AppTest による画面起動・言語切替確認）。"""

from pathlib import Path
from streamlit.testing.v1 import AppTest


def test_app_displays_home_and_switches_language() -> None:
    """app.py が起動してホーム（あいさつ画面）が表示され、英語（F11）に切り替えられることを確認する。"""
    app_path = Path(__file__).resolve().parent.parent / "app.py"
    at = AppTest.from_file(str(app_path)).run()
    assert not at.exception
    assert any("さん、" in h.value for h in at.html)

    # 英語に切り替えて再実行（右上アバターポップオーバー内の言語切替）
    at.radio(key="topbar_lang_radio").set_value("en").run()
    assert not at.exception
    assert any("Good " in h.value for h in at.html)



