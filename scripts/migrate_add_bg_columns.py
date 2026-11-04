"""既存スプレッドシートの members シートに bg_mode・bg_color 列を追加する移行スクリプト（フェーズ 7.7）。

べき等性：既に列が存在する場合は何もしません。
安全設計：既存のメンバーデータ（名前・メール・権限等）は一切変更せず、末尾に列を追加します。
"""

from __future__ import annotations

from pathlib import Path
import sys
import tomllib

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import gspread
from google.oauth2.service_account import Credentials


def run_migration() -> None:
    """members シートのヘッダーに bg_mode, bg_color を追加し、既存行を初期化する。"""
    secrets_path = ROOT_DIR / ".streamlit" / "secrets.toml"
    if not secrets_path.exists():
        print(f"Error: {secrets_path} が見つかりません。")
        sys.exit(1)

    with secrets_path.open("rb") as f:
        secrets = tomllib.load(f)

    sheets_cfg = secrets.get("connections", {}).get("sheets", {})
    sheet_id = sheets_cfg.get("spreadsheet_id", "")
    svc_info = sheets_cfg.get("service_account_info")

    if not sheet_id or not svc_info:
        print("Error: secrets.toml に connections.sheets の設定がありません。")
        sys.exit(1)

    creds = Credentials.from_service_account_info(
        svc_info,
        scopes=[
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/drive",
        ],
    )
    client = gspread.authorize(creds)
    spreadsheet = client.open_by_key(sheet_id)
    ws = spreadsheet.worksheet("members")

    all_values = ws.get_all_values()
    if not all_values:
        print("members シートが空です。")
        return

    headers = [h.strip() for h in all_values[0]]
    cols_to_add: list[str] = []
    if "bg_mode" not in headers:
        cols_to_add.append("bg_mode")
    if "bg_color" not in headers:
        cols_to_add.append("bg_color")

    if not cols_to_add:
        print("✓ members シートには既に bg_mode, bg_color 列が存在します（移行不要）。")
        return

    print(f"追加する列: {cols_to_add}")
    new_headers = headers + cols_to_add
    num_rows = len(all_values)

    # 1行目のヘッダー更新
    ws.update(values=[new_headers], range_name=f"A1", value_input_option="RAW")

    # 既存データ行（2行目以降）の末尾に "standard" を設定
    if num_rows > 1:
        start_col_idx = len(headers) + 1  # 1-based
        for r_idx in range(2, num_rows + 1):
            fill_values = ["standard"] * len(cols_to_add)
            # 例: K2:L2 等のセル範囲に一括書き込み
            ws.update(
                values=[fill_values],
                range_name=f"{gspread.utils.rowcol_to_a1(r_idx, start_col_idx)}:{gspread.utils.rowcol_to_a1(r_idx, start_col_idx + len(cols_to_add) - 1)}",
                value_input_option="RAW",
            )

    print(f"✓ 移行完了: {num_rows - 1} 件のメンバーに bg_mode='standard', bg_color='standard' を設定しました。")


if __name__ == "__main__":
    run_migration()

