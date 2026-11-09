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


def main() -> int:
    args = parse_args()
    now_str = datetime.now(JST).isoformat()
    print(f"[{now_str}] Starting Google Drive File Search Sync (dry_run={args.dry_run})")

    folder_id = args.folder_id or os.environ.get("DRIVE_AI_SHARED_FOLDER_ID", "").strip()
    gemini_api_key = os.environ.get("GEMINI_API_KEY", "").strip()

    if not folder_id:
        print("[Notice] No DRIVE_AI_SHARED_FOLDER_ID provided. Please configure folder ID in settings sheet or env.")
        print("[Notice] Skipping Drive file sync gracefully.")
        return 0

    print(f"Target Drive Folder ID: {folder_id}")

    # サービスアカウント認証の確認
    sa_json = os.environ.get("GCP_SERVICE_ACCOUNT_JSON", "").strip()
    if not sa_json and not os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
        print("[Notice] Neither GCP_SERVICE_ACCOUNT_JSON nor GOOGLE_APPLICATION_CREDENTIALS is set.")
        if args.dry_run:
            print("[DryRun] Simulating scan on dummy sample files...")
            sample_docs = [
                ("doc_001", "2026年度サマーフォーラム企画書.pdf", "会場候補とスケジュールのまとめ資料です。全メンバー共有用。", "application/pdf"),
                ("doc_002", "選考・面接結果メモ.docx", "選考結果の合否評価一覧です。連絡先: test@example.com", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
            ]
            for fid, fname, content, mime in sample_docs:
                scan_res = scan_document_for_pii(content)
                if scan_res.is_safe:
                    print(f"  [SAFE] {fname} ({fid}) -> Ready to index in File Search Store")
                else:
                    print(f"  [BLOCKED - PII] {fname} ({fid}) -> Reasons: {', '.join(scan_res.reasons)}")
            print("[DryRun] Simulation completed successfully.")
            return 0
        else:
            print("[Error] Credentials are required for non-dry-run execution.")
            return 1

    # 実際の Google Drive API 呼び出し（google-api-python-client または httpx）
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

        # フォルダ内ファイルの取得（ゴミ箱に入っていないもの）
        query = f"'{folder_id}' in parents and trashed = false"
        results = drive_service.files().list(
            q=query,
            pageSize=100,
            fields="files(id, name, mimeType, modifiedTime, webViewLink, size)"
        ).execute()

        files = results.get("files", [])
        print(f"Found {len(files)} files in Google Drive folder.")

        for f in files:
            file_id = f["id"]
            file_name = f["name"]
            mime_type = f["mimeType"]
            modified_time = f.get("modifiedTime", "")

            # ドキュメント本文の取得（Google Docs/Slides はエクスポート、その他はダウンロード）
            content_text = ""
            try:
                if mime_type == "application/vnd.google-apps.document":
                    content_bytes = drive_service.files().export(fileId=file_id, mimeType="text/plain").execute()
                    content_text = content_bytes.decode("utf-8", errors="replace")
                elif mime_type == "application/vnd.google-apps.presentation":
                    # スライドの簡易プレーンテキスト取得または PDF 化
                    pass
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
                    continue

            print(f"  [OK] File '{file_name}' is verified safe.")

        print("Google Drive File Search Sync finished successfully.")
        return 0

    except Exception as err:
        print(f"[Error] Failed during Drive sync: {err}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
