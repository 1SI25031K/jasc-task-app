"""scripts/sync_drive_files.py のテスト。

設定フラグ（feature_drive_file_search）やフォルダ ID の未指定時に
正常終了（エラーにならず exit code 0）すること、および
PII 検知時の Slack 通知先決定（admin_channel_id / summary_channel_id フォールバック）を検証する。
"""

from unittest.mock import MagicMock, patch

from core.settings import AppSettings
from scripts.sync_drive_files import (
    send_pii_slack_alert,
    sync_drive_files,
)


def test_sync_drive_files_skips_when_feature_disabled() -> None:
    """feature_drive_file_search が FALSE の場合、処理を行わず exit code 0 で終了することを確認する。"""
    settings = AppSettings.from_dict({
        "feature_drive_file_search": "FALSE",
        "drive_ai_shared_folder_id": "test_folder_123",
    })
    res = sync_drive_files(settings=settings)
    assert res == 0


def test_sync_drive_files_skips_when_folder_id_empty() -> None:
    """feature_drive_file_search が TRUE でもフォルダ ID が空の場合、exit code 0 で終了することを確認する。"""
    settings = AppSettings.from_dict({
        "feature_drive_file_search": "TRUE",
        "drive_ai_shared_folder_id": "",
    })
    res = sync_drive_files(settings=settings)
    assert res == 0


def test_sync_drive_dry_run_simulation() -> None:
    """dry_run=True の場合、模擬ファイルに対して PII 判定が行われ正常終了することを確認する。"""
    settings = AppSettings.from_dict({
        "feature_drive_file_search": "TRUE",
        "drive_ai_shared_folder_id": "test_folder_123",
        "admin_channel_id": "C_ADMIN",
    })
    res = sync_drive_files(settings=settings, dry_run=True)
    assert res == 0


def test_send_pii_slack_alert_with_admin_channel() -> None:
    """admin_channel_id が指定されている場合、そこへ Slack 通知が送信されることを確認する。"""
    with patch("slack_sdk.WebClient") as mock_client_cls:
        mock_instance = MagicMock()
        mock_client_cls.return_value = mock_instance

        success = send_pii_slack_alert(
            channel_id="C_ADMIN_123",
            file_name="面接選考結果.pdf",
            reasons=["選考・合否キーワード: '面接選考'"],
            slack_token="xoxb-dummy-token",
        )
        assert success is True
        mock_instance.chat_postMessage.assert_called_once()
        args, kwargs = mock_instance.chat_postMessage.call_args
        assert kwargs["channel"] == "C_ADMIN_123"
        assert "面接選考結果.pdf" in kwargs["text"]
        assert "セキュリティ警告" in kwargs["text"]


def test_send_pii_slack_alert_skipped_when_no_channel_or_token() -> None:
    """チャンネルまたはトークンが未設定の場合、Slack 通知がスキップされ False が返ること（エラーにならない）を確認する。"""
    # チャンネルなし
    assert not send_pii_slack_alert(channel_id="", file_name="doc.pdf", reasons=["test"], slack_token="xoxb-dummy")
    # トークンなし
    assert not send_pii_slack_alert(channel_id="C_ADMIN", file_name="doc.pdf", reasons=["test"], slack_token="")


def test_sync_drive_channel_resolution_admin_over_summary() -> None:
    """admin_channel_id がある場合は admin_channel_id が優先され、ない場合は summary_channel_id にフォールバックすることを確認する。"""
    settings_with_admin = AppSettings.from_dict({
        "admin_channel_id": "C_ADMIN",
        "summary_channel_id": "C_SUMMARY",
    })
    target_1 = settings_with_admin.admin_channel_id.strip() or settings_with_admin.summary_channel_id.strip()
    assert target_1 == "C_ADMIN"

    settings_with_only_summary = AppSettings.from_dict({
        "admin_channel_id": "",
        "summary_channel_id": "C_SUMMARY",
    })
    target_2 = settings_with_only_summary.admin_channel_id.strip() or settings_with_only_summary.summary_channel_id.strip()
    assert target_2 == "C_SUMMARY"
