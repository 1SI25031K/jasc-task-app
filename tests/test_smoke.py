"""フェーズ0〜2の疎通確認テスト（AppTest による画面起動・言語切替確認）。"""

from pathlib import Path
from streamlit.testing.v1 import AppTest


def test_app_displays_board_and_switches_language() -> None:
    """app.py が起動して役職ボード（F2）が表示され、英語（F11）に切り替えられることを確認する。"""
    app_path = Path(__file__).resolve().parent.parent / "app.py"
    at = AppTest.from_file(str(app_path)).run()
    assert not at.exception
    assert len(at.title) == 1
    assert "役職ボード" in at.title[0].value

    # 英語に切り替えて再実行
    at.sidebar.radio(key="lang_choice").set_value("en").run()
    assert not at.exception
    assert "Role Board" in at.title[0].value



