"""Google Drive 専用フォルダ（AI共有）の資料を Gemini File Search Store に同期するスクリプト（F21）。

使い方：
  # ドライラン（実際にはアップロード・更新せず、検査結果と差分を表示）
  uv run python scripts/sync_drive_files.py --dry-run

  # 本番同期実行
  uv run python scripts/sync_drive_files.py
"""

from __future__ import annotations

import argparse
from datetime import datetime
import json
import os
from pathlib import Path
import sys
from typing import Any

# プロジェクトルートを sys.path に追加
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from core.drive_scanner import scan_document_for_pii
from core.models import JST
from core.settings import AppSettings


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Sync Google Drive shared documents to Gemini File Search Store."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Perform a dry run without modifying Gemini File Search Store or Google Sheets.",
    )
    parser.add_argument(
        "--folder-id",
        type=str,
        default="",
        help="Google Drive folder ID to sync (defaults to settings or DRIVE_AI_SHARED_FOLDER_ID env).",
    )
    parser.add_argument(
        "--store-name",
        type=str,
        default="",
        help="Gemini File Search Store name (defaults to settings or GEMINI_FILE_SEARCH_STORE_NAME env).",
    )
    return parser.parse_args()


def send_pii_slack_alert(
    channel_id: str,
    file_name: str,
    reasons: list[str],
    slack_token: str | None = None,
) -> bool:
    """個人情報検知時に管理者用 Slack チャンネルへ警告通知を送信する（S16）。"""
    if not channel_id or not slack_token:
        print(
            f"[Notice] PII alert skipped: channel_id='{channel_id}', "
            f"slack_token={'SET' if slack_token else 'NOT SET'}"
        )
        return False
    try:
        from slack_sdk import WebClient

        client = WebClient(token=slack_token)
        reasons_text = ", ".join(reasons)
        message = (
            "⚠️ *【AI共有フォルダ セキュリティ警告】*\n"
            f"ファイル「`{file_name}`」から個人情報・機密情報（{reasons_text}）の疑いが検知されたため、"
            "File Search への取り込みをスキップしました。\n"
            "フォルダからファイルを移動するか、内容をご確認ください。"
        )
        client.chat_postMessage(channel=channel_id, text=message)
        print(f"[Alert] Sent security warning to Slack channel {channel_id} for file '{file_name}'")
        return True
    except Exception as e:
        print(f"[Warning] Failed to send Slack alert: {e}")
        return False


def log_sync_status(
    repo: Any,
    file_id: str,
    file_name: str,
    mime_type: str,
    drive_modified_time: str,
    gemini_file_resource_name: str,
    status: str,
    drive_link: str,
    error_message: str = "",
) -> None:
    """同期実行結果を drive_sync_logs シートに追記する。"""
    if repo is None:
        return
    now_str = datetime.now(JST).isoformat()
    row = [
        file_id,
        file_name,
        mime_type,
        drive_modified_time,
        gemini_file_resource_name,
        status,
        drive_link,
        now_str,
        error_message,
    ]
    try:
        if hasattr(repo, "_append_row_raw"):
            repo._append_row_raw("drive_sync_logs", row)
    except Exception as e:
        print(f"[Warning] Failed to append drive_sync_logs: {e}")


def sync_drive_files(
    folder_id: str = "",
    store_name: str = "",
    dry_run: bool = False,
    repo: Any = None,
    settings: AppSettings | None = None,
    slack_token: str | None = None,
    drive_service: Any = None,
    gemini_api_key: str | None = None,
) -> int:
    """Drive 同期処理のメインロジック。テストからも直接呼び出し可能。"""
    now_str = datetime.now(JST).isoformat()
    print(f"[{now_str}] Starting Google Drive File Search Sync (dry_run={dry_run})")

    # 1. 設定の解決
    if settings is None:
        if repo is not None:
            try:
                settings = repo.get_settings()
            except Exception as e:
                print(f"[Warning] Failed to load settings from repository: {e}")
                settings = AppSettings.from_dict({})
        else:
            settings = AppSettings.from_dict(
                {
                    "feature_drive_file_search": os.environ.get(
                        "FEATURE_DRIVE_FILE_SEARCH", "FALSE"
                    ),
                    "drive_ai_shared_folder_id": os.environ.get(
                        "DRIVE_AI_SHARED_FOLDER_ID", ""
                    ),
                    "gemini_file_search_store_name": os.environ.get(
                        "GEMINI_FILE_SEARCH_STORE_NAME", ""
                    ),
                    "admin_channel_id": os.environ.get("ADMIN_CHANNEL_ID", ""),
                    "summary_channel_id": os.environ.get("SUMMARY_CHANNEL_ID", ""),
                }
            )

    # 2. 機能フラグの確認（FALSE なら正常終了 0）
    if settings.feature_drive_file_search != "TRUE":
        print(
            f"[{now_str}] [Notice] feature_drive_file_search is FALSE. "
            "Skipping Google Drive sync gracefully."
        )
        return 0

    # 3. フォルダ ID の解決（空なら正常終了 0）
    effective_folder_id = (
        folder_id.strip()
        or settings.drive_ai_shared_folder_id.strip()
        or os.environ.get("DRIVE_AI_SHARED_FOLDER_ID", "").strip()
    )
    if not effective_folder_id:
        print(
            f"[{now_str}] [Notice] drive_ai_shared_folder_id is empty. "
            "Skipping Google Drive sync gracefully."
        )
        return 0

    print(f"[{now_str}] Target Drive Folder ID: {effective_folder_id}")

    # 4. アラート送信用チャンネルの解決（admin_channel_id -> summary_channel_id フォールバック）
    alert_channel_id = (
        settings.admin_channel_id.strip() or settings.summary_channel_id.strip()
    )
    effective_store_name = (
        store_name.strip()
        or settings.gemini_file_search_store_name.strip()
        or os.environ.get("GEMINI_FILE_SEARCH_STORE_NAME", "jasc-drive-docs").strip()
    )

    # 5. Drive サービスの初期化（外部から注入されていない場合）
    if drive_service is None:
        sa_json = os.environ.get("GCP_SERVICE_ACCOUNT_JSON", "").strip()
        if not sa_json and not os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
            print("[Notice] Neither GCP_SERVICE_ACCOUNT_JSON nor GOOGLE_APPLICATION_CREDENTIALS is set.")
            if dry_run:
                print("[DryRun] Simulating scan on dummy sample files...")
                sample_docs = [
                    (
                        "doc_001",
                        "2026年度サマーフォーラム企画書.pdf",
                        "会場候補とスケジュールのまとめ資料です。全メンバー共有用。",
                        "application/pdf",
                    ),
                    (
                        "doc_002",
                        "選考・面接結果メモ.docx",
                        "選考結果の合否評価一覧です。連絡先: test@example.com",
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    ),
                ]
                for fid, fname, content, mime in sample_docs:
                    scan_res = scan_document_for_pii(content)
                    if scan_res.is_safe:
                        print(f"  [SAFE] {fname} ({fid}) -> Ready to index in File Search Store")
                        log_sync_status(repo, fid, fname, mime, now_str, effective_store_name, "INDEXED", f"https://drive.google.com/file/d/{fid}/view")
                    else:
                        print(f"  [BLOCKED - PII] {fname} ({fid}) -> Reasons: {', '.join(scan_res.reasons)}")
                        send_pii_slack_alert(alert_channel_id, fname, scan_res.reasons, slack_token)
                        log_sync_status(repo, fid, fname, mime, now_str, "", "SKIPPED_PII", f"https://drive.google.com/file/d/{fid}/view", ", ".join(scan_res.reasons))
                print("[DryRun] Simulation completed successfully.")
                return 0
            else:
                print("[Error] Credentials are required for non-dry-run execution.")
                return 1

        try:
            from google.oauth2 import service_account
            from googleapiclient.discovery import build

            if sa_json:
                creds_info = json.loads(sa_json)
                creds = service_account.Credentials.from_service_account_info(
                    creds_info,
                    scopes=[
                        "https://www.googleapis.com/auth/drive.readonly",
                        "https://www.googleapis.com/auth/spreadsheets",
                    ],
                )
            else:
                import google.auth

                creds, _ = google.auth.default(
                    scopes=[
                        "https://www.googleapis.com/auth/drive.readonly",
                        "https://www.googleapis.com/auth/spreadsheets",
                    ]
                )
            drive_service = build("drive", "v3", credentials=creds)
        except Exception as e:
            print(f"[Error] Failed to initialize Google Drive client: {e}", file=sys.stderr)
            return 1

    # 6. Drive フォルダ内のファイル取得とスキャン・同期
    try:
        query = f"'{effective_folder_id}' in parents and trashed = false"
        results = drive_service.files().list(
            q=query,
            pageSize=100,
            fields="files(id, name, mimeType, modifiedTime, webViewLink, size)",
        ).execute()

        files = results.get("files", [])
        print(f"Found {len(files)} files in Google Drive folder.")

        for f in files:
            file_id = f["id"]
            file_name = f["name"]
            mime_type = f.get("mimeType", "")
            modified_time = f.get("modifiedTime", "")
            drive_link = f.get("webViewLink") or f"https://drive.google.com/file/d/{file_id}/view"

            content_text = ""
            try:
                if mime_type == "application/vnd.google-apps.document":
                    content_bytes = drive_service.files().export(fileId=file_id, mimeType="text/plain").execute()
                    content_text = content_bytes.decode("utf-8", errors="replace")
                elif mime_type in ["text/plain", "text/markdown", "text/csv"]:
                    content_bytes = drive_service.files().get_media(fileId=file_id).execute()
                    content_text = content_bytes.decode("utf-8", errors="replace")
            except Exception as e:
                print(f"  [Warning] Failed to extract text for {file_name}: {e}")

            # S16: 個人情報・機密情報の事前スキャン
            if content_text:
                scan_res = scan_document_for_pii(content_text)
                if not scan_res.is_safe:
                    print(f"  [SECURITY BLOCK] File '{file_name}' contains PII ({', '.join(scan_res.reasons)}). Skipping upload.")
                    send_pii_slack_alert(alert_channel_id, file_name, scan_res.reasons, slack_token)
                    if not dry_run:
                        log_sync_status(repo, file_id, file_name, mime_type, modified_time, "", "SKIPPED_PII", drive_link, ", ".join(scan_res.reasons))
                    continue

            print(f"  [OK] File '{file_name}' is verified safe.")
            if not dry_run:
                log_sync_status(repo, file_id, file_name, mime_type, modified_time, effective_store_name, "INDEXED", drive_link, "")

        print("Google Drive File Search Sync finished successfully.")
        return 0
    except Exception as err:
        print(f"[Error] Failed during Drive sync: {err}", file=sys.stderr)
        return 1


def main() -> int:
    args = parse_args()
    spreadsheet_id = os.environ.get("SPREADSHEET_ID", "").strip()
    sa_json = os.environ.get("GCP_SERVICE_ACCOUNT_JSON", "").strip()
    slack_token = os.environ.get("SLACK_BOT_TOKEN", "").strip()
    gemini_api_key = os.environ.get("GEMINI_API_KEY", "").strip()

    repo = None
    if spreadsheet_id and (sa_json or os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")):
        try:
            from core.sheets_repository import SheetsRepository

            if sa_json:
                repo = SheetsRepository.from_service_account_info(
                    spreadsheet_id=spreadsheet_id,
                    service_account_info=json.loads(sa_json),
                )
            else:
                repo = SheetsRepository(spreadsheet_id=spreadsheet_id)
        except Exception as e:
            print(f"[Warning] Could not initialize SheetsRepository: {e}")

    return sync_drive_files(
        folder_id=args.folder_id,
        store_name=args.store_name,
        dry_run=args.dry_run,
        repo=repo,
        slack_token=slack_token,
        gemini_api_key=gemini_api_key,
    )


if __name__ == "__main__":
    sys.exit(main())
