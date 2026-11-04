"""スプレッドシートに全10シートと1行目の列名を作成し、ダミー初期データを流し込むスクリプト。"""

from __future__ import annotations

from datetime import date, datetime
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


def initialize_spreadsheet_with_dummy_data(
    spreadsheet: Any, today: date | None = None
) -> None:
    """開かれた gspread.Spreadsheet に全10シートと列名を作成し、ダミー初期データを RAW で書き込む（4.・S5）。"""
    base_date = today or datetime.now(JST).date()
    existing_titles = {ws.title for ws in spreadsheet.worksheets()}

    members = build_dummy_members()
    roles = build_dummy_roles()
    role_assignments = build_dummy_role_assignments()
    tasks = build_dummy_tasks(base_date)
    checkins = build_dummy_checkins(base_date)
    snapshots = build_dummy_daily_snapshots(
        today=base_date, members=members, roles=roles
    )
    settings_rows = AppSettings().to_rows()

    initial_data_by_sheet: dict[str, list[list[str]]] = {
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
        print(
            f"✅ シート `{sheet_name}` を初期化しました（ヘッダー + データ {len(all_rows) - 1} 行）"
        )

    clear_sheets_cache()


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


def main() -> None:
    """コマンドラインから実行された際にスプレッドシートの初期化を実行する。"""
    secrets = load_local_secrets()
    spreadsheet_id = str(secrets.get("spreadsheet_id", "")).strip()
    sa_info = secrets.get("gcp_service_account")

    if not spreadsheet_id or spreadsheet_id == "your-spreadsheet-id-here":
        raise ValueError(
            "`.streamlit/secrets.toml` の `spreadsheet_id` に実際のスプレッドシートIDを設定してください。"
        )
    if not isinstance(sa_info, dict):
        raise ValueError(
            "`.streamlit/secrets.toml` に `[gcp_service_account]` セクションが見つかりません。"
        )

    print("Google スプレッドシートに接続しています...")
    client = gspread.service_account_from_dict(sa_info)
    spreadsheet = client.open_by_key(spreadsheet_id)
    initialize_spreadsheet_with_dummy_data(spreadsheet)
    print("🎉 全10シートの初期化とダミーデータの投入が完了しました！")


if __name__ == "__main__":
    main()

