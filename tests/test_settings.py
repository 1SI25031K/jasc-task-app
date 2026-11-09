"""core/settings.py の単体テスト。"""

from core.models import SettingRow
from core.settings import AppSettings


def test_default_settings() -> None:
    """空の辞書から生成した場合、4.10 の既定値がすべて設定されることを確認する。"""
    cfg = AppSettings.from_dict({})
    assert cfg.checkin_weekdays == ["月", "水", "金"]
    assert cfg.daily_job_time == "08:00"
    assert cfg.load_window_days == 14
    assert cfg.weight_points == {"軽": 1, "中": 2, "重": 3}
    assert cfg.overdue_escalation_days == 3
    assert cfg.stale_days == 7
    assert cfg.request_reminder_days == 2
    assert cfg.high_load_score == 8
    assert cfg.high_load_consecutive == 2
    assert cfg.summary_channel_id == ""
    assert cfg.admin_channel_id == ""
    assert cfg.app_url == ""
    assert cfg.feature_drive_file_search == "FALSE"
    assert cfg.drive_ai_shared_folder_id == ""


def test_custom_settings_and_roundtrip() -> None:
    """カスタム値のパースと SettingRow への変換が往復できることを確認する。"""
    raw = {
        "checkin_weekdays": "火,木",
        "daily_job_time": "09:30",
        "load_window_days": "21",
        "weight_points": "軽=2,中=4,重=6",
        "overdue_escalation_days": "5",
        "stale_days": "10",
        "request_reminder_days": "3",
        "high_load_score": "9",
        "high_load_consecutive": "3",
        "summary_channel_id": "C01234567",
        "admin_channel_id": "C09876543",
        "app_url": "https://example.streamlit.app",
        "feature_drive_file_search": "TRUE",
        "drive_ai_shared_folder_id": "folder_abc_123",
    }
    cfg = AppSettings.from_dict(raw)
    assert cfg.checkin_weekdays == ["火", "木"]
    assert cfg.daily_job_time == "09:30"
    assert cfg.load_window_days == 21
    assert cfg.weight_points == {"軽": 2, "中": 4, "重": 6}
    assert cfg.overdue_escalation_days == 5
    assert cfg.stale_days == 10
    assert cfg.request_reminder_days == 3
    assert cfg.high_load_score == 9
    assert cfg.high_load_consecutive == 3
    assert cfg.summary_channel_id == "C01234567"
    assert cfg.admin_channel_id == "C09876543"
    assert cfg.app_url == "https://example.streamlit.app"
    assert cfg.feature_drive_file_search == "TRUE"
    assert cfg.drive_ai_shared_folder_id == "folder_abc_123"

    rows = cfg.to_rows()
    assert isinstance(rows[0], SettingRow)
    reconstructed = AppSettings.from_rows(rows)
    assert reconstructed == cfg


def test_invalid_values_fallback_to_defaults() -> None:
    """数値項目に不正な文字列が入っていた場合、既定値にフォールバックすることを確認する。"""
    raw = {
        "load_window_days": "abc",
        "weight_points": "軽=x,中=5",
        "checkin_weekdays": " , ",
    }
    cfg = AppSettings.from_dict(raw)
    assert cfg.load_window_days == 14
    assert cfg.weight_points == {"軽": 1, "中": 5, "重": 3}
    assert cfg.checkin_weekdays == ["月", "水", "金"]

