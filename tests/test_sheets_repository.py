"""フェーズ3：SheetsRepository・init_sheet・RAW書き込み（S5）・キャッシュ破棄（6.2）・楽観的ロック（S7）の単体テスト。"""

from __future__ import annotations

from dataclasses import replace
from datetime import date, datetime, timedelta
from typing import Any
import pytest

from core.models import (
    JST,
    ActivityLog,
    Checkin,
    DailySnapshot,
    Meeting,
    OptimisticLockError,
    ReminderLog,
    Task,
)
from core.session import create_repository_from_config
from core.sheets_repository import (
    SHEET_HEADERS,
    SheetsRepository,
    clear_sheets_cache,
)
from scripts.init_sheet import (
    ensure_spreadsheet_is_empty,
    initialize_spreadsheet,
    initialize_spreadsheet_with_dummy_data,
)


class FakeWorksheet:
    """テスト用のインメモリ gspread.Worksheet モック。すべての書き込みで value_input_option='RAW' を強制検査する。"""

    def __init__(self, title: str) -> None:
        self.title = title
        self.rows: list[list[str]] = []
        self.write_calls: list[tuple[str, str | None]] = []

    def get_all_values(self) -> list[list[str]]:
        return [list(r) for r in self.rows]

    def clear(self) -> None:
        self.rows = []

    def append_row(
        self,
        values: list[Any],
        value_input_option: str | None = None,
        **kwargs: Any,
    ) -> None:
        self.write_calls.append(("append_row", value_input_option))
        assert value_input_option == "RAW", (
            f"S5 violation: append_row called with value_input_option={value_input_option}"
        )
        self.rows.append([str(v) for v in values])

    def append_rows(
        self,
        values: list[list[Any]],
        value_input_option: str | None = None,
        **kwargs: Any,
    ) -> None:
        self.write_calls.append(("append_rows", value_input_option))
        assert value_input_option == "RAW", (
            f"S5 violation: append_rows called with value_input_option={value_input_option}"
        )
        for row in values:
            self.rows.append([str(v) for v in row])

    def update(
        self,
        values: list[list[Any]] | None = None,
        range_name: str = "A1",
        value_input_option: str | None = None,
        **kwargs: Any,
    ) -> None:
        self.write_calls.append(("update", value_input_option))
        assert value_input_option == "RAW", (
            f"S5 violation: update called with value_input_option={value_input_option}"
        )
        assert values is not None
        # range_name は "A1", "A2" 等の行指定
        row_num_str = "".join(ch for ch in range_name if ch.isdigit())
        start_idx = (int(row_num_str) - 1) if row_num_str else 0
        for offset, row in enumerate(values):
            target_idx = start_idx + offset
            str_row = [str(v) for v in row]
            while len(self.rows) <= target_idx:
                self.rows.append([])
            self.rows[target_idx] = str_row


class FakeSpreadsheet:
    """テスト用のインメモリ gspread.Spreadsheet モック。"""

    def __init__(self, sheet_id: str = "fake_sheet_001") -> None:
        self.id = sheet_id
        self._sheets: dict[str, FakeWorksheet] = {
            "Sheet1": FakeWorksheet("Sheet1")
        }

    def worksheets(self) -> list[FakeWorksheet]:
        return list(self._sheets.values())

    def worksheet(self, name: str) -> FakeWorksheet:
        if name not in self._sheets:
            raise KeyError(f"Worksheet not found: {name}")
        return self._sheets[name]

    def add_worksheet(
        self, title: str, rows: int = 100, cols: int = 20
    ) -> FakeWorksheet:
        ws = FakeWorksheet(title)
        self._sheets[title] = ws
        return ws

    def del_worksheet(self, ws: FakeWorksheet) -> None:
        if ws.title in self._sheets:
            del self._sheets[ws.title]


def test_init_sheet_and_sheets_repository_crud_and_raw_option() -> None:
    """init_sheet で全10シートとヘッダー・初期データが作られ、SheetsRepository で RAW 読み書き・キャッシュ破棄・楽観的ロックが動くことを確認する。"""
    today = date(2026, 11, 3)
    now = datetime(2026, 11, 3, 12, 0, tzinfo=JST)
    fake_ss = FakeSpreadsheet("test_ss_id")

    # 1. init_sheet の実行確認：全10シートが作られ、1行目が SHEET_HEADERS と一致すること
    initialize_spreadsheet_with_dummy_data(fake_ss, today=today)
    for sheet_name, expected_headers in SHEET_HEADERS.items():
        ws = fake_ss.worksheet(sheet_name)
        all_vals = ws.get_all_values()
        assert len(all_vals) >= 1
        assert all_vals[0] == expected_headers

    repo = SheetsRepository(fake_ss)

    # 2. 読み込みの確認（8名・21役職・30タスク・32チェックイン・設定）
    assert len(repo.list_members()) == 8
    assert len(repo.list_roles()) == 21
    assert len(repo.list_tasks()) == 30
    assert len(repo.list_checkins()) == 32
    assert repo.get_settings().load_window_days == 14

    m_a = repo.get_member_by_email("MEMBER_A@example.com")
    assert m_a is not None
    assert m_a.member_id == "m001"

    # 3. 言語設定の更新とキャッシュ破棄の確認
    repo.update_member_lang("m001", "en")
    assert repo.get_member_by_email("member_a@example.com").lang == "en"  # type: ignore[union-attr]

    # 4. 数式インジェクション対策（S5）：=HYPERLINK(...) を含むタスクを追加しても RAW 文字列としてそのまま保存されること
    formula_task = Task(
        task_id="t_formula",
        title='=HYPERLINK("https://evil.example.com", "Click")',
        role_ids=["r_chair"],
        owner_member_id="m001",
        next_action="=SUM(1,2)",
        na_due=today,
        created_at=now,
        created_by="m001",
        updated_at=now,
        updated_by="m001",
    )
    repo.add_task(formula_task)
    loaded_formula = repo.get_task("t_formula")
    assert loaded_formula is not None
    assert (
        loaded_formula.title
        == '=HYPERLINK("https://evil.example.com", "Click")'
    )
    assert loaded_formula.next_action == "=SUM(1,2)"

    # 5. 楽観的ロック（S7）：updated_at が一致すれば更新成功、不一致なら OptimisticLockError
    later = now + timedelta(minutes=5)
    updated_formula = replace(
        loaded_formula, title="安全なタイトルに更新", updated_at=later
    )
    repo.update_task(
        updated_formula, expected_updated_at=loaded_formula.updated_at
    )
    assert repo.get_task("t_formula").title == "安全なタイトルに更新"  # type: ignore[union-attr]

    with pytest.raises(OptimisticLockError):
        # 古い updated_at (now) を渡して更新しようとするとエラーになる
        repo.update_task(
            replace(updated_formula, title="不正な上書き"),
            expected_updated_at=now,
        )

    # 6. 同日チェックインの上書き確認（4.5）
    c1 = Checkin("c901", "m001", today, score=4, comment="朝")
    c2 = Checkin("c902", "m001", today, score=8, comment="夜（上書き）")
    repo.save_checkin(c1)
    cnt_after_c1 = len(repo.list_checkins(member_id="m001"))
    repo.save_checkin(c2)
    m1_checkins = repo.list_checkins(member_id="m001")
    assert len(m1_checkins) == cnt_after_c1
    assert m1_checkins[-1].score == 8
    assert m1_checkins[-1].comment == "夜（上書き）"

    # 7. 日次スナップショットの上書き確認（4.8）
    snap1 = DailySnapshot(today, "ALL", "", 31, 5, 26, 3, 5 / 31, None)
    snap2 = DailySnapshot(today, "ALL", "", 31, 10, 21, 2, 10 / 31, None)
    repo.save_daily_snapshots([snap1])
    cnt_snaps = len(repo.list_daily_snapshots())
    repo.save_daily_snapshots([snap2])
    snaps_after = repo.list_daily_snapshots()
    assert len(snaps_after) == cnt_snaps
    latest_all = next(
        s for s in snaps_after if s.date == today and s.scope_type == "ALL"
    )
    assert latest_all.done == 10

    # 8. activity_log / meetings / reminder_log の追加・取得
    repo.add_activity_log(
        ActivityLog(now, "m001", "t_formula", "create", "title", "", "test")
    )
    assert len(repo.list_activity_logs(task_id="t_formula")) == 1

    repo.add_meeting(Meeting("mtg_1", today, "第5回定例会", "m001", now, 3, 2))
    assert len(repo.list_meetings()) == 1

    repo.add_reminder_log(
        ReminderLog(now, "m001", "due_today", "t_formula", today.isoformat())
    )
    assert len(repo.list_reminder_logs(date_key=today.isoformat())) == 1

    clear_sheets_cache()


def test_create_repository_from_config_switching() -> None:
    """secrets の設定によって InMemory と Sheets が切り替わることを確認する。"""
    repo_mem = create_repository_from_config({"repository_backend": "memory"})
    assert repo_mem.__class__.__name__ == "InMemoryRepository"

    # sheets 指定時に必須キーがない場合は分かりやすい ValueError を出す
    with pytest.raises(ValueError):
        create_repository_from_config({"repository_backend": "sheets"})


def test_init_sheet_no_dummy_mode() -> None:
    """--no-dummy モード（本番用）でヘッダー・役職マスタ・設定値のみが投入され、ダミーデータが入らないことを確認する。"""
    fake_ss = FakeSpreadsheet("prod_ss_id")

    # 初期状態は空（Sheet1のみ）
    ensure_spreadsheet_is_empty(fake_ss)

    initialize_spreadsheet(fake_ss, no_dummy=True)

    # 全10シートが作成され、初期 Sheet1 は削除されていること
    sheet_titles = {ws.title for ws in fake_ss.worksheets()}
    assert sheet_titles == set(SHEET_HEADERS.keys())
    assert "Sheet1" not in sheet_titles

    repo = SheetsRepository(fake_ss)

    # roles（21役職）と settings（既定値）のみ入り、他は空
    assert len(repo.list_roles()) == 21
    assert repo.get_settings().load_window_days == 14
    assert len(repo.list_members()) == 0
    assert len(repo.list_tasks()) == 0
    assert len(repo.list_checkins()) == 0
    assert len(repo.list_role_assignments()) == 0
    assert len(repo.list_activity_logs()) == 0
    assert len(repo.list_meetings()) == 0
    assert len(repo.list_daily_snapshots()) == 0
    assert len(repo.list_reminder_logs()) == 0


def test_ensure_spreadsheet_is_empty_guards() -> None:
    """すでにデータや管理シートが存在する場合に安全に例外を送出して中止することを確認する。"""
    # 1. 管理シート（tasks など）が既に存在する場合
    dirty_ss1 = FakeSpreadsheet("dirty_1")
    dirty_ss1.add_worksheet("tasks")
    with pytest.raises(ValueError, match="安全保護.*tasks"):
        ensure_spreadsheet_is_empty(dirty_ss1)

    # 2. シート内に値が入っている場合
    dirty_ss2 = FakeSpreadsheet("dirty_2")
    dirty_ss2.worksheet("Sheet1").rows.append(["some_user_data"])
    with pytest.raises(ValueError, match="安全保護.*Sheet1.*既にデータ"):
        ensure_spreadsheet_is_empty(dirty_ss2)


