"""フェーズ0の疎通確認テスト。"""

from pathlib import Path
from streamlit.testing.v1 import AppTest


def test_app_displays_title() -> None:
    """app.py が起動し、準備中のタイトルが表示されることを確認する。"""
    app_path = Path(__file__).resolve().parent.parent / "app.py"
    at = AppTest.from_file(str(app_path)).run()
    assert not at.exception
    assert len(at.title) == 1
    assert at.title[0].value == "JASC79 タスク管理（準備中）"


