"""Google スプレッドシート（gspread）を使った Repository 実装（S5 RAW書き込み・st.cache_data TTL60秒・楽観的ロック）。"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Iterable
import gspread
import streamlit as st

from core.models import (
    JST,
    ActivityLog,
    Checkin,
    DailySnapshot,
    Meeting,
    Member,
    OptimisticLockError,
    ReminderLog,
    Role,
    RoleAssignment,
    SettingRow,
    Task,
    format_comma_ids,
    parse_comma_ids,
)
from core.repository import Repository
from core.settings import AppSettings

# 要件定義書「4. データ設計」準拠の全10シート名と1行目の列名（ヘッダー）
SHEET_HEADERS: dict[str, list[str]] = {
    "members": [
        "member_id",
        "display_name",
        "display_name_en",
        "email",
        "main_roles",
        "lang",
        "slack_user_id",
        "reminders_enabled",
        "is_admin",
        "active",
    ],
    "roles": [
        "role_id",
        "name",
        "name_en",
        "category",
        "sort_order",
        "active",
    ],
    "role_assignments": [
        "role_id",
        "member_id",
        "kind",
    ],
    "tasks": [
        "task_id",
        "title",
        "role_ids",
        "owner_member_id",
        "requested_by",
        "assignment_status",
        "assignment_comment",
        "weight",
        "next_action",
        "na_due",
        "task_due",
        "status",
        "waiting_on_member_id",
        "priority",
        "blocker",
        "notes",
        "source",
        "meeting_id",
        "completed_at",
        "completed_by",
        "created_at",
        "created_by",
        "updated_at",
        "updated_by",
        "archived",
    ],
    "checkins": [
        "checkin_id",
        "member_id",
        "date",
        "score",
        "comment",
        "auto_load_at_checkin",
    ],
    "activity_log": [
        "timestamp",
        "member_id",
        "task_id",
        "action",
        "field",
        "old_value",
        "new_value",
    ],
    "meetings": [
        "meeting_id",
        "meeting_date",
        "title",
        "created_by",
        "created_at",
        "generated_count",
        "saved_count",
    ],
    "daily_snapshots": [
        "date",
        "scope_type",
        "scope_id",
        "total",
        "done",
        "open",
        "overdue",
        "completion_rate",
        "auto_load",
    ],
    "reminder_log": [
        "sent_at",
        "member_id",
        "kind",
        "task_id",
        "date_key",
    ],
    "settings": [
        "key",
        "value",
    ],
}


# ==============================================================================
# 型変換・シリアライズ／デシリアライズ用ヘルパー関数
# ==============================================================================


def _parse_bool(val: Any, default: bool = False) -> bool:
    """シート上の文字列（TRUE/FALSE 等）を bool に変換する。"""
    if isinstance(val, bool):
        return val
    s = str(val).strip().upper()
    if s in ("TRUE", "1", "YES"):
        return True
    if s in ("FALSE", "0", "NO"):
        return False
    return default


def _format_bool(val: bool) -> str:
    """bool をシート保存用の 'TRUE' / 'FALSE' 文字列に変換する。"""
    return "TRUE" if val else "FALSE"


def _parse_date(val: Any) -> date | None:
    """YYYY-MM-DD 文字列を date に変換する。空や不正なら None。"""
    if isinstance(val, date) and not isinstance(val, datetime):
        return val
    s = str(val).strip()
    if not s:
        return None
    try:
        return date.fromisoformat(s[:10])
    except ValueError:
        return None


def _format_date(val: date | None) -> str:
    """date を YYYY-MM-DD 文字列に変換する。"""
    return val.isoformat() if val is not None else ""


def _parse_datetime(val: Any) -> datetime | None:
    """ISO形式の日時文字列を Asia/Tokyo の datetime に変換する。"""
    if isinstance(val, datetime):
        return val if val.tzinfo else val.replace(tzinfo=JST)
    s = str(val).strip()
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            return dt.replace(tzinfo=JST)
        return dt.astimezone(JST)
    except ValueError:
        return None


def _format_datetime(val: datetime | None) -> str:
    """datetime を ISO 8601 文字列（秒単位まで）に変換する。"""
    if val is None:
        return ""
    if val.tzinfo is None:
        val = val.replace(tzinfo=JST)
    return val.astimezone(JST).isoformat(timespec="seconds")


def _row_to_dict(headers: list[str], row: list[Any]) -> dict[str, str]:
    """1行のリストをヘッダー名をキーとする辞書に変換する。"""
    return {
        h: (str(row[i]) if i < len(row) and row[i] is not None else "")
        for i, h in enumerate(headers)
    }


def member_to_row(m: Member) -> list[str]:
    """Member をシート1行分の文字列リストに変換する。"""
    return [
        m.member_id,
        m.display_name,
        m.display_name_en,
        m.email,
        format_comma_ids(m.main_roles),
        m.lang,
        m.slack_user_id,
        _format_bool(m.reminders_enabled),
        _format_bool(m.is_admin),
        _format_bool(m.active),
    ]


def row_to_member(d: dict[str, str]) -> Member:
    """行辞書から Member を復元する。"""
    lang_val = d.get("lang", "ja").strip()
    return Member(
        member_id=d["member_id"].strip(),
        display_name=d.get("display_name", "").strip(),
        display_name_en=d.get("display_name_en", "").strip(),
        email=d.get("email", "").strip(),
        main_roles=parse_comma_ids(d.get("main_roles", "")),
        lang="en" if lang_val == "en" else "ja",
        slack_user_id=d.get("slack_user_id", "").strip(),
        reminders_enabled=_parse_bool(d.get("reminders_enabled"), True),
        is_admin=_parse_bool(d.get("is_admin"), False),
        active=_parse_bool(d.get("active"), True),
    )


def role_to_row(r: Role) -> list[str]:
    """Role をシート1行分の文字列リストに変換する。"""
    return [
        r.role_id,
        r.name,
        r.name_en,
        r.category,
        str(r.sort_order),
        _format_bool(r.active),
    ]


def row_to_role(d: dict[str, str]) -> Role:
    """行辞書から Role を復元する。"""
    try:
        sort_order = int(d.get("sort_order", "0").strip() or "0")
    except ValueError:
        sort_order = 0
    return Role(
        role_id=d["role_id"].strip(),
        name=d.get("name", "").strip(),
        name_en=d.get("name_en", "").strip(),
        category=d.get("category", "その他").strip() or "その他",  # type: ignore[arg-type]
        sort_order=sort_order,
        active=_parse_bool(d.get("active"), True),
    )


def role_assignment_to_row(ra: RoleAssignment) -> list[str]:
    """RoleAssignment をシート1行分の文字列リストに変換する。"""
    return [ra.role_id, ra.member_id, ra.kind]


def row_to_role_assignment(d: dict[str, str]) -> RoleAssignment:
    """行辞書から RoleAssignment を復元する。"""
    return RoleAssignment(
        role_id=d["role_id"].strip(),
        member_id=d["member_id"].strip(),
        kind=d.get("kind", "担当").strip() or "担当",  # type: ignore[arg-type]
    )


def task_to_row(t: Task) -> list[str]:
    """Task をシート1行分の文字列リストに変換する。"""
    return [
        t.task_id,
        t.title,
        format_comma_ids(t.role_ids),
        t.owner_member_id,
        t.requested_by,
        t.assignment_status,
        t.assignment_comment,
        t.weight,
        t.next_action,
        _format_date(t.na_due),
        _format_date(t.task_due),
        t.status,
        t.waiting_on_member_id,
        t.priority,
        t.blocker,
        t.notes,
        t.source,
        t.meeting_id,
        _format_datetime(t.completed_at),
        t.completed_by,
        _format_datetime(t.created_at),
        t.created_by,
        _format_datetime(t.updated_at),
        t.updated_by,
        _format_bool(t.archived),
    ]


def row_to_task(d: dict[str, str]) -> Task:
    """行辞書から Task を復元する。"""
    now = datetime.now(JST)
    na_due = _parse_date(d.get("na_due")) or now.date()
    created_at = _parse_datetime(d.get("created_at")) or now
    updated_at = _parse_datetime(d.get("updated_at")) or created_at
    return Task(
        task_id=d["task_id"].strip(),
        title=d.get("title", ""),
        role_ids=parse_comma_ids(d.get("role_ids", "")),
        owner_member_id=d.get("owner_member_id", "").strip(),
        requested_by=d.get("requested_by", "").strip(),
        assignment_status=(
            d.get("assignment_status", "承諾済").strip() or "承諾済"
        ),  # type: ignore[arg-type]
        assignment_comment=d.get("assignment_comment", ""),
        weight=d.get("weight", "中").strip() or "中",  # type: ignore[arg-type]
        next_action=d.get("next_action", ""),
        na_due=na_due,
        task_due=_parse_date(d.get("task_due")),
        status=d.get("status", "未着手").strip() or "未着手",  # type: ignore[arg-type]
        waiting_on_member_id=d.get("waiting_on_member_id", "").strip(),
        priority=d.get("priority", "中").strip() or "中",  # type: ignore[arg-type]
        blocker=d.get("blocker", ""),
        notes=d.get("notes", ""),
        source=d.get("source", "manual").strip() or "manual",  # type: ignore[arg-type]
        meeting_id=d.get("meeting_id", "").strip(),
        completed_at=_parse_datetime(d.get("completed_at")),
        completed_by=d.get("completed_by", "").strip(),
        created_at=created_at,
        created_by=d.get("created_by", "").strip(),
        updated_at=updated_at,
        updated_by=d.get("updated_by", "").strip(),
        archived=_parse_bool(d.get("archived"), False),
    )


def checkin_to_row(c: Checkin) -> list[str]:
    """Checkin をシート1行分の文字列リストに変換する。"""
    return [
        c.checkin_id,
        c.member_id,
        _format_date(c.date),
        str(c.score),
        c.comment,
        str(c.auto_load_at_checkin),
    ]


def row_to_checkin(d: dict[str, str]) -> Checkin:
    """行辞書から Checkin を復元する。"""
    c_date = _parse_date(d.get("date")) or datetime.now(JST).date()
    try:
        score = int(d.get("score", "5").strip() or "5")
    except ValueError:
        score = 5
    try:
        auto_load = int(d.get("auto_load_at_checkin", "0").strip() or "0")
    except ValueError:
        auto_load = 0
    return Checkin(
        checkin_id=d["checkin_id"].strip(),
        member_id=d["member_id"].strip(),
        date=c_date,
        score=score,
        comment=d.get("comment", ""),
        auto_load_at_checkin=auto_load,
    )


def activity_log_to_row(log: ActivityLog) -> list[str]:
    """ActivityLog をシート1行分の文字列リストに変換する。"""
    return [
        _format_datetime(log.timestamp),
        log.member_id,
        log.task_id,
        log.action,
        log.field,
        log.old_value,
        log.new_value,
    ]


def row_to_activity_log(d: dict[str, str]) -> ActivityLog:
    """行辞書から ActivityLog を復元する。"""
    ts = _parse_datetime(d.get("timestamp")) or datetime.now(JST)
    return ActivityLog(
        timestamp=ts,
        member_id=d.get("member_id", "").strip(),
        task_id=d.get("task_id", "").strip(),
        action=d.get("action", "update").strip() or "update",  # type: ignore[arg-type]
        field=d.get("field", ""),
        old_value=d.get("old_value", ""),
        new_value=d.get("new_value", ""),
    )


def meeting_to_row(mtg: Meeting) -> list[str]:
    """Meeting をシート1行分の文字列リストに変換する。"""
    return [
        mtg.meeting_id,
        _format_date(mtg.meeting_date),
        mtg.title,
        mtg.created_by,
        _format_datetime(mtg.created_at),
        str(mtg.generated_count),
        str(mtg.saved_count),
    ]


def row_to_meeting(d: dict[str, str]) -> Meeting:
    """行辞書から Meeting を復元する。"""
    now = datetime.now(JST)
    m_date = _parse_date(d.get("meeting_date")) or now.date()
    c_at = _parse_datetime(d.get("created_at")) or now
    try:
        gen_cnt = int(d.get("generated_count", "0").strip() or "0")
    except ValueError:
        gen_cnt = 0
    try:
        sav_cnt = int(d.get("saved_count", "0").strip() or "0")
    except ValueError:
        sav_cnt = 0
    return Meeting(
        meeting_id=d["meeting_id"].strip(),
        meeting_date=m_date,
        title=d.get("title", ""),
        created_by=d.get("created_by", "").strip(),
        created_at=c_at,
        generated_count=gen_cnt,
        saved_count=sav_cnt,
    )


def daily_snapshot_to_row(s: DailySnapshot) -> list[str]:
    """DailySnapshot をシート1行分の文字列リストに変換する。"""
    return [
        _format_date(s.date),
        s.scope_type,
        s.scope_id,
        str(s.total),
        str(s.done),
        str(s.open),
        str(s.overdue),
        str(s.completion_rate),
        str(s.auto_load) if s.auto_load is not None else "",
    ]


def row_to_daily_snapshot(d: dict[str, str]) -> DailySnapshot:
    """行辞書から DailySnapshot を復元する。"""
    s_date = _parse_date(d.get("date")) or datetime.now(JST).date()
    try:
        total = int(d.get("total", "0") or "0")
        done = int(d.get("done", "0") or "0")
        open_c = int(d.get("open", "0") or "0")
        overdue = int(d.get("overdue", "0") or "0")
        rate = float(d.get("completion_rate", "0.0") or "0.0")
    except ValueError:
        total, done, open_c, overdue, rate = 0, 0, 0, 0, 0.0
    auto_raw = d.get("auto_load", "").strip()
    auto_load: int | None = None
    if auto_raw:
        try:
            auto_load = int(float(auto_raw))
        except ValueError:
            auto_load = None
    return DailySnapshot(
        date=s_date,
        scope_type=d.get("scope_type", "ALL").strip() or "ALL",  # type: ignore[arg-type]
        scope_id=d.get("scope_id", "").strip(),
        total=total,
        done=done,
        open=open_c,
        overdue=overdue,
        completion_rate=rate,
        auto_load=auto_load,
    )


def reminder_log_to_row(r: ReminderLog) -> list[str]:
    """ReminderLog をシート1行分の文字列リストに変換する。"""
    return [
        _format_datetime(r.sent_at),
        r.member_id,
        r.kind,
        r.task_id,
        r.date_key,
    ]


def row_to_reminder_log(d: dict[str, str]) -> ReminderLog:
    """行辞書から ReminderLog を復元する。"""
    sent_at = _parse_datetime(d.get("sent_at")) or datetime.now(JST)
    return ReminderLog(
        sent_at=sent_at,
        member_id=d.get("member_id", "").strip(),
        kind=d.get("kind", "due_today").strip() or "due_today",  # type: ignore[arg-type]
        task_id=d.get("task_id", "").strip(),
        date_key=d.get("date_key", "").strip(),
    )


# ==============================================================================
# キャッシュ付きシート読み込み関数（6.2：st.cache_data TTL 60秒）
# ==============================================================================

_ACTIVE_SPREADSHEET: Any = None


@st.cache_data(ttl=60, show_spinner=False)
def _fetch_sheet_rows_cached(
    spreadsheet_id: str, sheet_name: str
) -> list[dict[str, str]]:
    """指定シートの全データ行（2行目以降）を辞書リストとして取得し、60秒間キャッシュする（6.2）。"""
    if _ACTIVE_SPREADSHEET is None:
        raise RuntimeError("Spreadsheet client is not initialized.")
    ws = _ACTIVE_SPREADSHEET.worksheet(sheet_name)
    all_values: list[list[str]] = ws.get_all_values()
    if len(all_values) <= 1:
        return []
    headers = [h.strip() for h in all_values[0]]
    result: list[dict[str, str]] = []
    for row in all_values[1:]:
        if not any(str(cell).strip() for cell in row):
            continue
        result.append(_row_to_dict(headers, row))
    return result


def clear_sheets_cache() -> None:
    """スプレッドシート読み込みキャッシュを破棄する（書き込み直後に呼び出す 6.2）。"""
    _fetch_sheet_rows_cached.clear()


# ==============================================================================
# SheetsRepository クラス本体
# ==============================================================================


class SheetsRepository(Repository):
    """Google スプレッドシート（gspread）をバックエンドとする Repository 実装。

    セキュリティ・非機能要件：
    - S5：すべての書き込みで value_input_option="RAW" を指定する（数式インジェクション対策）。
    - S7：update_task 時にシート上の最新 updated_at を確認し、不一致なら OptimisticLockError を送出する。
    - 6.2：読み込みは st.cache_data(ttl=60) でキャッシュし、書き込み後にキャッシュを破棄する。
    """

    def __init__(self, spreadsheet: Any) -> None:
        """開かれた gspread.Spreadsheet オブジェクトを受け取って初期化する。"""
        global _ACTIVE_SPREADSHEET
        self._spreadsheet = spreadsheet
        self._spreadsheet_id = str(getattr(spreadsheet, "id", "default_sheet"))
        _ACTIVE_SPREADSHEET = spreadsheet

    @classmethod
    def from_service_account_info(
        cls, service_account_info: dict[str, Any], spreadsheet_id: str
    ) -> SheetsRepository:
        """サービスアカウント辞書（secrets.toml の [gcp_service_account]）とスプレッドシートIDから接続を作成する。"""
        client = gspread.service_account_from_dict(service_account_info)
        spreadsheet = client.open_by_key(spreadsheet_id)
        return cls(spreadsheet=spreadsheet)

    def _read_rows(self, sheet_name: str) -> list[dict[str, str]]:
        """キャッシュ経由で指定シートの行辞書リストを取得する。"""
        global _ACTIVE_SPREADSHEET
        _ACTIVE_SPREADSHEET = self._spreadsheet
        return _fetch_sheet_rows_cached(self._spreadsheet_id, sheet_name)

    def _append_row_raw(self, sheet_name: str, row_values: list[str]) -> None:
        """指定シートの末尾に value_input_option='RAW' で1行追加し、キャッシュを破棄する（S5・6.2）。"""
        ws = self._spreadsheet.worksheet(sheet_name)
        ws.append_row(row_values, value_input_option="RAW")
        clear_sheets_cache()

    def _update_row_raw(
        self, sheet_name: str, row_number_1based: int, row_values: list[str]
    ) -> None:
        """指定シートの指定行（1始まり）を value_input_option='RAW' で更新し、キャッシュを破棄する（S5・6.2）。"""
        ws = self._spreadsheet.worksheet(sheet_name)
        range_name = f"A{row_number_1based}"
        ws.update(
            values=[row_values],
            range_name=range_name,
            value_input_option="RAW",
        )
        clear_sheets_cache()

    # ------------------------------------------------------------------
    # Repository インターフェースの実装
    # ------------------------------------------------------------------

    def list_members(self, active_only: bool = False) -> list[Member]:
        """メンバー一覧を取得する。"""
        rows = self._read_rows("members")
        members = [row_to_member(r) for r in rows if r.get("member_id")]
        if active_only:
            return [m for m in members if m.active]
        return members

    def get_member_by_email(self, email: str) -> Member | None:
        """メールアドレス（小文字比較）でメンバーを検索する。"""
        normalized = email.strip().lower()
        for m in self.list_members(active_only=False):
            if m.email.strip().lower() == normalized:
                return m
        return None

    def update_member_lang(self, member_id: str, lang: str) -> None:
        """メンバーの表示言語設定（ja / en）を RAW で更新し、キャッシュを破棄する。"""
        ws = self._spreadsheet.worksheet("members")
        all_values: list[list[str]] = ws.get_all_values()
        if len(all_values) <= 1:
            return
        headers = [h.strip() for h in all_values[0]]
        for idx, row in enumerate(all_values[1:], start=2):
            d = _row_to_dict(headers, row)
            if d.get("member_id", "").strip() == member_id:
                member = row_to_member(d)
                member.lang = "en" if lang == "en" else "ja"
                self._update_row_raw("members", idx, member_to_row(member))
                return

    def list_roles(self, active_only: bool = False) -> list[Role]:
        """役職一覧を sort_order 順で取得する。"""
        rows = self._read_rows("roles")
        roles = [row_to_role(r) for r in rows if r.get("role_id")]
        if active_only:
            roles = [r for r in roles if r.active]
        return sorted(roles, key=lambda r: r.sort_order)

    def list_role_assignments(self) -> list[RoleAssignment]:
        """役職の担当割り当て一覧を取得する。"""
        rows = self._read_rows("role_assignments")
        return [
            row_to_role_assignment(r)
            for r in rows
            if r.get("role_id") and r.get("member_id")
        ]

    def get_settings(self) -> AppSettings:
        """settings シートの運用パラメータを取得する。"""
        rows = self._read_rows("settings")
        setting_rows = [
            SettingRow(key=r.get("key", "").strip(), value=r.get("value", ""))
            for r in rows
            if r.get("key", "").strip()
        ]
        return AppSettings.from_rows(setting_rows)

    def list_tasks(self, include_archived: bool = False) -> list[Task]:
        """タスク一覧を取得する。"""
        rows = self._read_rows("tasks")
        tasks = [row_to_task(r) for r in rows if r.get("task_id")]
        if include_archived:
            return tasks
        return [t for t in tasks if not t.archived]

    def get_task(self, task_id: str) -> Task | None:
        """指定された task_id のタスクを取得する。"""
        for t in self.list_tasks(include_archived=True):
            if t.task_id == task_id:
                return t
        return None

    def add_task(self, task: Task) -> Task:
        """新しいタスクを value_input_option='RAW' で追加する（S5）。"""
        existing = self.get_task(task.task_id)
        if existing is not None:
            raise ValueError(f"Task ID {task.task_id} already exists.")
        self._append_row_raw("tasks", task_to_row(task))
        return task

    def update_task(
        self, task: Task, expected_updated_at: datetime
    ) -> Task:
        """タスクを更新する。シート上の最新 updated_at と一致しない場合は OptimisticLockError を送出する（S7）。"""
        ws = self._spreadsheet.worksheet("tasks")
        all_values: list[list[str]] = ws.get_all_values()
        if len(all_values) <= 1:
            raise KeyError(f"Task not found: {task.task_id}")
        headers = [h.strip() for h in all_values[0]]

        for idx, row in enumerate(all_values[1:], start=2):
            d = _row_to_dict(headers, row)
            if d.get("task_id", "").strip() == task.task_id:
                current_in_sheet = row_to_task(d)
                # S7：秒単位（ISO文字列）で比較し、他の人が先に更新していたら例外を送出
                if _format_datetime(current_in_sheet.updated_at) != _format_datetime(
                    expected_updated_at
                ):
                    raise OptimisticLockError(
                        f"タスク（{task.task_id}）は他のメンバーによって先に更新されました。"
                        "画面を再読み込みして最新の内容を確認してください。"
                    )
                self._update_row_raw("tasks", idx, task_to_row(task))
                return task

        raise KeyError(f"Task not found: {task.task_id}")

    def list_checkins(
        self, member_id: str | None = None
    ) -> list[Checkin]:
        """体感負荷チェックイン履歴を日付昇順で取得する。"""
        rows = self._read_rows("checkins")
        items = [row_to_checkin(r) for r in rows if r.get("checkin_id")]
        if member_id:
            items = [c for c in items if c.member_id == member_id]
        return sorted(items, key=lambda c: (c.date, c.checkin_id))

    def save_checkin(self, checkin: Checkin) -> Checkin:
        """体感負荷を保存する。同じ人が同じ日に回答済みの場合は新しい回答で上書きする（4.5）。"""
        ws = self._spreadsheet.worksheet("checkins")
        all_values: list[list[str]] = ws.get_all_values()
        if len(all_values) > 1:
            headers = [h.strip() for h in all_values[0]]
            target_date_str = _format_date(checkin.date)
            for idx, row in enumerate(all_values[1:], start=2):
                d = _row_to_dict(headers, row)
                if (
                    d.get("member_id", "").strip() == checkin.member_id
                    and d.get("date", "").strip() == target_date_str
                ):
                    self._update_row_raw("checkins", idx, checkin_to_row(checkin))
                    return checkin

        self._append_row_raw("checkins", checkin_to_row(checkin))
        return checkin

    def list_activity_logs(
        self, task_id: str | None = None
    ) -> list[ActivityLog]:
        """変更履歴を取得する。"""
        rows = self._read_rows("activity_log")
        logs = [row_to_activity_log(r) for r in rows if r.get("timestamp")]
        if task_id:
            logs = [log for log in logs if log.task_id == task_id]
        return logs

    def add_activity_log(self, log: ActivityLog) -> None:
        """変更履歴を1件追加する。"""
        self._append_row_raw("activity_log", activity_log_to_row(log))

    def list_meetings(self) -> list[Meeting]:
        """会議一覧を取得する。"""
        rows = self._read_rows("meetings")
        return [row_to_meeting(r) for r in rows if r.get("meeting_id")]

    def add_meeting(self, meeting: Meeting) -> None:
        """会議記録を1件追加する。"""
        self._append_row_raw("meetings", meeting_to_row(meeting))

    def list_daily_snapshots(self) -> list[DailySnapshot]:
        """日次スナップショット一覧を取得する。"""
        rows = self._read_rows("daily_snapshots")
        return [row_to_daily_snapshot(r) for r in rows if r.get("date")]

    def save_daily_snapshots(
        self, snapshots: Iterable[DailySnapshot]
    ) -> None:
        """日次スナップショットを保存する。同じ（date, scope_type, scope_id）があれば上書きする（4.8）。"""
        snap_list = list(snapshots)
        if not snap_list:
            return
        ws = self._spreadsheet.worksheet("daily_snapshots")
        all_values: list[list[str]] = ws.get_all_values()
        headers = SHEET_HEADERS["daily_snapshots"]

        existing_row_map: dict[tuple[str, str, str], int] = {}
        if len(all_values) > 1:
            sheet_headers = [h.strip() for h in all_values[0]]
            for idx, row in enumerate(all_values[1:], start=2):
                d = _row_to_dict(sheet_headers, row)
                key = (
                    d.get("date", "").strip(),
                    d.get("scope_type", "").strip(),
                    d.get("scope_id", "").strip(),
                )
                existing_row_map[key] = idx
        elif not all_values:
            ws.append_row(headers, value_input_option="RAW")

        rows_to_append: list[list[str]] = []
        for snap in snap_list:
            key = (_format_date(snap.date), snap.scope_type, snap.scope_id)
            row_vals = daily_snapshot_to_row(snap)
            if key in existing_row_map:
                row_num = existing_row_map[key]
                ws.update(
                    values=[row_vals],
                    range_name=f"A{row_num}",
                    value_input_option="RAW",
                )
            else:
                rows_to_append.append(row_vals)

        if rows_to_append:
            ws.append_rows(rows_to_append, value_input_option="RAW")

        clear_sheets_cache()

    def list_reminder_logs(
        self, date_key: str | None = None
    ) -> list[ReminderLog]:
        """送信済みリマインド履歴を取得する。"""
        rows = self._read_rows("reminder_log")
        logs = [row_to_reminder_log(r) for r in rows if r.get("date_key")]
        if date_key:
            logs = [r for r in logs if r.date_key == date_key]
        return logs

    def add_reminder_log(self, log: ReminderLog) -> None:
        """送信済みリマインド履歴を1件追加する。"""
        self._append_row_raw("reminder_log", reminder_log_to_row(log))

