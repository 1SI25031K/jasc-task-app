"""Python 版と TypeScript 版の集計結果が 100% 一致するか検証するためのスクリプト。
本番スプレッドシートのデータを直接読み込んで主要メトリクスを算出・出力します。
"""

from __future__ import annotations

import json
from datetime import date, datetime
from pathlib import Path
import sys
import tomllib

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import gspread

from core.models import JST
from core.sheets_repository import SheetsRepository
from core.services import (
    build_home_summary,
    calc_completion_rate,
    format_completion_rate,
    get_due_this_week_tasks,
    get_overdue_tasks,
)
from core.load import (
    calc_member_auto_load,
    scale_auto_loads_to_10,
    get_latest_checkin,
    has_load_gap,
)

def main():
    secrets_path = Path(".streamlit/secrets.toml")
    if not secrets_path.exists():
        print("secrets.toml not found")
        return

    with open(secrets_path, "rb") as f:
        secrets = tomllib.load(f)

    spreadsheet_id = secrets.get("spreadsheet_id")
    gcp_sa = secrets.get("gcp_service_account")

    gc = gspread.service_account_from_dict(gcp_sa)
    spreadsheet = gc.open_by_key(spreadsheet_id)

    repo = SheetsRepository(spreadsheet)
    today = date.today()

    members = repo.list_members(active_only=True)
    roles = repo.list_roles(active_only=True)
    tasks = repo.list_tasks(include_archived=False)
    checkins = repo.list_checkins()

    overdue_tasks = get_overdue_tasks(tasks, today)
    due_week_tasks = get_due_this_week_tasks(tasks, today)
    rate = calc_completion_rate(tasks)

    auto_loads = {m.member_id: calc_member_auto_load(m.member_id, tasks, today) for m in members}
    scaled_loads = scale_auto_loads_to_10(auto_loads)

    gaps = []
    for m in members:
        latest, is_fresh = get_latest_checkin(m.member_id, checkins, today)
        subj = latest.score if (latest and is_fresh) else None
        if has_load_gap(scaled_loads.get(m.member_id, 1), subj):
            gaps.append(m.display_name)

    results = {
        "today": str(today),
        "active_members_count": len(members),
        "active_roles_count": len(roles),
        "active_tasks_count": len(tasks),
        "overdue_tasks_count": len(overdue_tasks),
        "due_week_tasks_count": len(due_week_tasks),
        "completion_rate": format_completion_rate(rate),
        "members_with_load_gap": gaps,
        "sample_home_summary_ja": build_home_summary(members[0].member_id, tasks, today, "ja") if members else "",
        "auto_loads": auto_loads,
        "scaled_loads": scaled_loads,
    }

    print("=== Python 版の算出結果 ===")
    print(json.dumps(results, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
