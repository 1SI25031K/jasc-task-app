"""データモデル（スプレッドシートの全10シートに対応するデータクラス）と専用例外の定義。"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Literal
from zoneinfo import ZoneInfo

JST = ZoneInfo("Asia/Tokyo")

# リテラル型定義（要件定義書 4. データ設計 準拠）
LangCode = Literal["ja", "en"]
RoleCategory = Literal["主役職", "副役職", "サイト", "その他"]
AssignmentKind = Literal["責任者", "担当", "サポート"]
AssignmentStatus = Literal["承諾済", "依頼中", "相談中"]
TaskWeight = Literal["軽", "中", "重"]
TaskStatus = Literal["未着手", "進行中", "待ち", "完了"]
TaskPriority = Literal["高", "中", "低"]
TaskSource = Literal["manual", "minutes"]
ActivityAction = Literal[
    "create",
    "create_from_minutes",
    "update",
    "request",
    "accept",
    "consult",
    "archive",
    "restore",
]
ScopeType = Literal["ALL", "role", "member"]
ReminderKind = Literal[
    "due_tomorrow",
    "due_today",
    "overdue",
    "overdue_escalation",
    "waiting",
    "stale",
    "request_pending",
    "checkin",
    "high_load_alert",
]


class OptimisticLockError(Exception):
    """他のユーザーが先にタスクを更新していた場合（updated_at 不一致）に送出する例外（S7）。"""


class InvalidAssignmentTransitionError(Exception):
    """依頼・承諾・相談の状態遷移がルールに違反している場合に送出する例外（5.3）。"""


def parse_comma_ids(raw: str) -> list[str]:
    """カンマ区切りのID文字列をリストに変換する。空要素は除外する。"""
    if not raw:
        return []
    return [part.strip() for part in raw.split(",") if part.strip()]


def format_comma_ids(ids: list[str]) -> str:
    """IDのリストをカンマ区切りの文字列に変換する。"""
    return ",".join(item.strip() for item in ids if item.strip())


@dataclass
class Member:
    """4.1 members（メンバー）シートの1行を表すデータクラス。"""

    member_id: str
    display_name: str
    display_name_en: str
    email: str
    main_roles: list[str] = field(default_factory=list)
    lang: LangCode = "ja"
    slack_user_id: str = ""
    reminders_enabled: bool = True
    is_admin: bool = False
    active: bool = True

    def get_name(self, lang: LangCode = "ja") -> str:
        """指定された言語に応じた表示名を返す。英語名が空なら display_name を返す。"""
        if lang == "en" and self.display_name_en.strip():
            return self.display_name_en
        return self.display_name


@dataclass
class Role:
    """4.2 roles（役職）シートの1行を表すデータクラス。"""

    role_id: str
    name: str
    name_en: str
    category: RoleCategory
    sort_order: int
    active: bool = True

    def get_name(self, lang: LangCode = "ja") -> str:
        """指定された言語に応じた役職名を返す。"""
        if lang == "en" and self.name_en.strip():
            return self.name_en
        return self.name


@dataclass
class RoleAssignment:
    """4.3 role_assignments（役職の担当割り当て）シートの1行を表すデータクラス。"""

    role_id: str
    member_id: str
    kind: AssignmentKind


@dataclass
class Task:
    """4.4 tasks（タスク）シートの1行を表すデータクラス。"""

    task_id: str
    title: str
    role_ids: list[str]
    owner_member_id: str
    next_action: str
    na_due: date
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str
    requested_by: str = ""
    assignment_status: AssignmentStatus = "承諾済"
    assignment_comment: str = ""
    weight: TaskWeight = "中"
    task_due: date | None = None
    status: TaskStatus = "未着手"
    waiting_on_member_id: str = ""
    priority: TaskPriority = "中"
    blocker: str = ""
    notes: str = ""
    source: TaskSource = "manual"
    meeting_id: str = ""
    completed_at: datetime | None = None
    completed_by: str = ""
    archived: bool = False


@dataclass
class Checkin:
    """4.5 checkins（体感負荷）シートの1行を表すデータクラス。"""

    checkin_id: str
    member_id: str
    date: date
    score: int
    comment: str = ""
    auto_load_at_checkin: int = 0


@dataclass
class ActivityLog:
    """4.6 activity_log（変更履歴）シートの1行を表すデータクラス。"""

    timestamp: datetime
    member_id: str
    task_id: str
    action: ActivityAction
    field: str = ""
    old_value: str = ""
    new_value: str = ""


@dataclass
class Meeting:
    """4.7 meetings（議事メモから NA を生成した会議）シートの1行を表すデータクラス。"""

    meeting_id: str
    meeting_date: date
    title: str
    created_by: str
    created_at: datetime
    generated_count: int
    saved_count: int


@dataclass
class DailySnapshot:
    """4.8 daily_snapshots（進捗グラフ用の日次集計）シートの1行を表すデータクラス。"""

    date: date
    scope_type: ScopeType
    scope_id: str
    total: int
    done: int
    open: int
    overdue: int
    completion_rate: float
    auto_load: int | None = None


@dataclass
class ReminderLog:
    """4.9 reminder_log（送信済みリマインド）シートの1行を表すデータクラス。"""

    sent_at: datetime
    member_id: str
    kind: ReminderKind
    task_id: str
    date_key: str


@dataclass
class SettingRow:
    """4.10 settings（運用パラメータ）シートの1行を表すデータクラス。"""

    key: str
    value: str

