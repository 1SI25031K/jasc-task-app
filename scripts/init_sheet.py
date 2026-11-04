"""スプレッドシートに全10シートと1行目の列名を作成し、初期データを流し込むスクリプト。

- 通常モード: 全10シート・列名ヘッダー・ダミー初期データを投入（開発・テスト用）
- 本番用モード (--no-dummy): 全10シート・列名ヘッダー・roles（役職マスタ）・settings（既定値）のみを投入し、
  メンバーやタスクなどのダミーデータは投入しない。
- 安全機能: 初期化前に対象スプレッドシートが空であることを検証し、既存データがある場合は中断する。
"""

from __future__ import annotations

import argparse
from datetime import date, datetime
import os
from pathlib import Path
import sys
import tomllib
from typing import Any

# プロジェクトルートを sys.path に追加
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import gspread

from core.models import JST
from core.repository import (
    build_dummy_checkins,
    build_dummy_daily_snapshots,
    build_dummy_members,
    build_dummy_role_assignments,
    build_dummy_roles,
    build_dummy_tasks,
)
from core.settings import AppSettings
from core.sheets_repository import (
    SHEET_HEADERS,
    checkin_to_row,
    clear_sheets_cache,
    daily_snapshot_to_row,
    member_to_row,
    role_assignment_to_row,
    role_to_row,
    task_to_row,
)


def ensure_spreadsheet_is_empty(spreadsheet: Any) -> None:
    """初期化前に対象スプレッドシートが空であることを確認し、空でなければ例外を送出して中止する。"""
    worksheets = spreadsheet.worksheets()
    for ws in worksheets:
        # 1. 本アプリの管理シート名が既に存在するか確認
        if ws.title in SHEET_HEADERS:
            raise ValueError(
                f"安全保護: スプレッドシートに対象管理シート '{ws.title}' が既に存在します。\n"
                "既存のデータを保護するため、初期化処理を安全に中止しました。"
            )
        # 2. セルに何らかの値が入っているか確認
        values = ws.get_all_values()
        has_content = any(any(str(cell).strip() for cell in row) for row in values)
        if has_content:
            raise ValueError(
                f"安全保護: ワークシート '{ws.title}' に既にデータ（値）が存在します。\n"
                "既存のデータを保護するため、初期化処理を安全に中止しました。"
            )


def initialize_spreadsheet(
    spreadsheet: Any,
    today: date | None = None,
    no_dummy: bool = False,
) -> None:
    """開かれた gspread.Spreadsheet に全10シートと列名を作成し、初期データを RAW で書き込む（S5）。

    Parameters
    ----------
    spreadsheet : Any
        gspread.Spreadsheet インスタンス
    today : date | None
        基準日（省略時は JST 現在日）
    no_dummy : bool
        True の場合、ダミーデータ（メンバー・タスク・体感負荷等）を入れず、
        ヘッダー・役職マスタ（roles）・設定既定値（settings）のみ投入する。
    """
    base_date = today or datetime.now(JST).date()
    existing_worksheets = spreadsheet.worksheets()
    existing_titles = {ws.title for ws in existing_worksheets}

    roles = build_dummy_roles()
    settings_rows = AppSettings().to_rows()

    if no_dummy:
        # 本番用モード：roles（役職マスタ）と settings（設定既定値）のみ作成
        initial_data_by_sheet: dict[str, list[list[str]]] = {
            "members": [],
            "roles": [role_to_row(r) for r in roles],
            "role_assignments": [],
            "tasks": [],
            "checkins": [],
            "activity_log": [],
            "meetings": [],
            "daily_snapshots": [],
            "reminder_log": [],
            "settings": [[sr.key, sr.value] for sr in settings_rows],
        }
    else:
        # 開発・テスト用モード：ダミーデータをフル投入
        members = build_dummy_members()
        role_assignments = build_dummy_role_assignments()
        tasks = build_dummy_tasks(base_date)
        checkins = build_dummy_checkins(base_date)
        snapshots = build_dummy_daily_snapshots(
            today=base_date, members=members, roles=roles
        )
        initial_data_by_sheet = {
            "members": [member_to_row(m) for m in members],
            "roles": [role_to_row(r) for r in roles],
            "role_assignments": [
                role_assignment_to_row(ra) for ra in role_assignments
            ],
            "tasks": [task_to_row(t) for t in tasks],
            "checkins": [checkin_to_row(c) for c in checkins],
            "activity_log": [],
            "meetings": [],
            "daily_snapshots": [daily_snapshot_to_row(s) for s in snapshots],
            "reminder_log": [],
            "settings": [[sr.key, sr.value] for sr in settings_rows],
        }

    for sheet_name, headers in SHEET_HEADERS.items():
        if sheet_name not in existing_titles:
            ws = spreadsheet.add_worksheet(
                title=sheet_name,
                rows=max(200, len(initial_data_by_sheet[sheet_name]) + 50),
                cols=len(headers) + 2,
            )
            existing_titles.add(sheet_name)
        else:
            ws = spreadsheet.worksheet(sheet_name)
            ws.clear()

        all_rows = [headers] + initial_data_by_sheet.get(sheet_name, [])
        # S5：すべての書き込みは value_input_option="RAW"
        ws.update(
            values=all_rows,
            range_name="A1",
            value_input_option="RAW",
        )
        data_count = len(all_rows) - 1
        print(
            f"✅ シート `{sheet_name}` を初期化しました（ヘッダー + データ {data_count} 行）"
        )

    # 新規作成時に存在していたデフォルトシート（"Sheet1", "シート1" など）を安全に整理
    for ws in existing_worksheets:
        if ws.title not in SHEET_HEADERS:
            try:
                spreadsheet.del_worksheet(ws)
                print(f"🗑️ 初期デフォルトシート `{ws.title}` を削除しました。")
            except Exception:
                pass

    clear_sheets_cache()


def initialize_spreadsheet_with_dummy_data(
    spreadsheet: Any, today: date | None = None
) -> None:
    """互換性のためのラッパー関数（ダミーデータ付きで初期化）。"""
    initialize_spreadsheet(spreadsheet, today=today, no_dummy=False)


def load_local_secrets() -> dict[str, Any]:
    """`.streamlit/secrets.toml` を読み込んで辞書として返す。"""
    secrets_path = ROOT_DIR / ".streamlit" / "secrets.toml"
    if not secrets_path.is_file():
        raise FileNotFoundError(
            f"設定ファイルが見つかりません: {secrets_path}\n"
            "`.streamlit/secrets.toml.example` をコピーして `.streamlit/secrets.toml` を作成し、"
            "spreadsheet_id と [gcp_service_account] を設定してください。"
        )
    with secrets_path.open("rb") as f:
        return tomllib.load(f)


def parse_args() -> argparse.Namespace:
    """コマンドライン引数を解析する。"""
    parser = argparse.ArgumentParser(
        description="JASC タスクマネージャー スプレッドシート初期化スクリプト"
    )
    parser.add_argument(
        "--spreadsheet-id",
        type=str,
        default=None,
        help="対象の Google スプレッドシート ID（省略時は環境変数 SPREADSHEET_ID または secrets.toml の値を使用）",
    )
    parser.add_argument(
        "--no-dummy",
        action="store_true",
        help="ダミーデータを入れずに、ヘッダー・役職マスタ・設定既定値のみで初期化する（本番用モード）",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="空シートチェックをスキップして強制初期化する（※既存データがある場合は上書きされます）",
    )
    return parser.parse_args()


def main() -> None:
    """コマンドラインから実行された際にスプレッドシートの初期化を実行する。"""
    args = parse_args()

    # 1. secrets.toml の読み込み（存在しなくても環境変数があれば動作可能）
    secrets: dict[str, Any] = {}
    try:
        secrets = load_local_secrets()
    except Exception:
        pass

    # 2. スプレッドシートIDの解決（CLI 引数 > 環境変数 > secrets.toml）
    spreadsheet_id = (
        args.spreadsheet_id or os.environ.get("SPREADSHEET_ID") or ""
    ).strip()
    if not spreadsheet_id:
        spreadsheet_id = str(secrets.get("spreadsheet_id", "")).strip()

    if not spreadsheet_id or spreadsheet_id == "your-spreadsheet-id-here":
        raise ValueError(
            "スプレッドシート ID が指定されていません。\n"
            "`--spreadsheet-id <ID>` 引数、または環境変数 `SPREADSHEET_ID` で指定してください。\n"
            "※ローカルの secrets.toml を書き換える必要はありません。"
        )

    # 3. サービスアカウント情報の取得
    sa_info = secrets.get("gcp_service_account")
    if not sa_info and "GCP_SERVICE_ACCOUNT_JSON" in os.environ:
        import json

        sa_info = json.loads(os.environ["GCP_SERVICE_ACCOUNT_JSON"])

    if not isinstance(sa_info, dict):
        raise ValueError(
            "GCP サービスアカウント情報が見つかりません。\n"
            "`.streamlit/secrets.toml` の `[gcp_service_account]` または環境変数 `GCP_SERVICE_ACCOUNT_JSON` を確認してください。"
        )

    mode_label = (
        "【本番モード（ダミーデータなし）】"
        if args.no_dummy
        else "【開発/テストモード（ダミーデータあり）】"
    )
    print(f"=== スプレッドシート初期化処理開始 {mode_label} ===")
    print(f"対象スプレッドシートID: {spreadsheet_id}")

    print("Google スプレッドシートに接続しています...")
    client = gspread.service_account_from_dict(sa_info)
    spreadsheet = client.open_by_key(spreadsheet_id)

    # 4. 空シートチェック（--force が指定されていない限り必須）
    if not args.force:
        print("スプレッドシートが空であることを確認しています...")
        ensure_spreadsheet_is_empty(spreadsheet)
        print("確認完了: 対象スプレッドシートは空です。安全に初期化を継続します。")

    # 5. 初期化実行
    initialize_spreadsheet(spreadsheet, no_dummy=args.no_dummy)
    print("🎉 全10シートの初期化が安全に完了しました！")


if __name__ == "__main__":
    main()
