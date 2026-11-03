"""Repository インターフェース（抽象基底クラス）と InMemoryRepository（ダミー初期データ付き）の実装。"""

from __future__ import annotations

from abc import ABC, abstractmethod
from copy import deepcopy
from datetime import date, datetime, time, timedelta
from typing import Iterable

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
    Task,
)
from core.settings import AppSettings


class Repository(ABC):
    """データアクセス層の抽象インターフェース（3. 設計方針）。"""

    @abstractmethod
    def list_members(self, active_only: bool = False) -> list[Member]:
        """メンバー一覧を取得する。"""

    @abstractmethod
    def get_member_by_email(self, email: str) -> Member | None:
        """メールアドレス（小文字比較）でメンバーを検索する。"""

    @abstractmethod
    def update_member_lang(self, member_id: str, lang: str) -> None:
        """メンバーの表示言語設定（ja / en）を更新する。"""

    @abstractmethod
    def list_roles(self, active_only: bool = False) -> list[Role]:
        """役職一覧を取得する。"""

    @abstractmethod
    def list_role_assignments(self) -> list[RoleAssignment]:
        """役職の担当割り当て一覧を取得する。"""

    @abstractmethod
    def get_settings(self) -> AppSettings:
        """settings シートの運用パラメータを取得する。"""

    @abstractmethod
    def list_tasks(self, include_archived: bool = False) -> list[Task]:
        """タスク一覧を取得する。"""

    @abstractmethod
    def get_task(self, task_id: str) -> Task | None:
        """指定された task_id のタスクを取得する。"""

    @abstractmethod
    def add_task(self, task: Task) -> Task:
        """新しいタスクを追加する。"""

    @abstractmethod
    def update_task(
        self, task: Task, expected_updated_at: datetime
    ) -> Task:
        """タスクを更新する。updated_at が expected_updated_at と一致しない場合は OptimisticLockError を送出する（S7）。"""

    @abstractmethod
    def list_checkins(
        self, member_id: str | None = None
    ) -> list[Checkin]:
        """体感負荷チェックイン履歴を取得する。"""

    @abstractmethod
    def save_checkin(self, checkin: Checkin) -> Checkin:
        """体感負荷を保存する。同じ人が同じ日に回答済みの場合は新しい回答で上書きする（4.5）。"""

    @abstractmethod
    def list_activity_logs(
        self, task_id: str | None = None
    ) -> list[ActivityLog]:
        """変更履歴を取得する。"""

    @abstractmethod
    def add_activity_log(self, log: ActivityLog) -> None:
        """変更履歴を1件追加する。"""

    @abstractmethod
    def list_meetings(self) -> list[Meeting]:
        """会議一覧を取得する。"""

    @abstractmethod
    def add_meeting(self, meeting: Meeting) -> None:
        """会議記録を1件追加する。"""

    @abstractmethod
    def list_daily_snapshots(self) -> list[DailySnapshot]:
        """日次スナップショット一覧を取得する。"""

    @abstractmethod
    def save_daily_snapshots(
        self, snapshots: Iterable[DailySnapshot]
    ) -> None:
        """日次スナップショットを保存する。同じ（date, scope_type, scope_id）があれば上書きする（4.8）。"""

    @abstractmethod
    def list_reminder_logs(
        self, date_key: str | None = None
    ) -> list[ReminderLog]:
        """送信済みリマインド履歴を取得する。"""

    @abstractmethod
    def add_reminder_log(self, log: ReminderLog) -> None:
        """送信済みリマインド履歴を1件追加する。"""


class InMemoryRepository(Repository):
    """テストおよびローカル開発用のインメモリ Repository 実装。"""

    def __init__(
        self,
        members: list[Member] | None = None,
        roles: list[Role] | None = None,
        role_assignments: list[RoleAssignment] | None = None,
        tasks: list[Task] | None = None,
        checkins: list[Checkin] | None = None,
        activity_logs: list[ActivityLog] | None = None,
        meetings: list[Meeting] | None = None,
        daily_snapshots: list[DailySnapshot] | None = None,
        reminder_logs: list[ReminderLog] | None = None,
        settings: AppSettings | None = None,
    ) -> None:
        """インメモリデータを初期化する。"""
        self._members: list[Member] = deepcopy(members) if members else []
        self._roles: list[Role] = deepcopy(roles) if roles else []
        self._role_assignments: list[RoleAssignment] = (
            deepcopy(role_assignments) if role_assignments else []
        )
        self._tasks: list[Task] = deepcopy(tasks) if tasks else []
        self._checkins: list[Checkin] = deepcopy(checkins) if checkins else []
        self._activity_logs: list[ActivityLog] = (
            deepcopy(activity_logs) if activity_logs else []
        )
        self._meetings: list[Meeting] = deepcopy(meetings) if meetings else []
        self._daily_snapshots: list[DailySnapshot] = (
            deepcopy(daily_snapshots) if daily_snapshots else []
        )
        self._reminder_logs: list[ReminderLog] = (
            deepcopy(reminder_logs) if reminder_logs else []
        )
        self._settings: AppSettings = (
            deepcopy(settings) if settings else AppSettings()
        )

    @classmethod
    def create_with_dummy_data(
        cls, today: date | None = None
    ) -> InMemoryRepository:
        """要件定義書 4.2・5.3・5.4・5.5 を満たすダミー初期データ入りのリポジトリを生成する。"""
        base_date = today or datetime.now(JST).date()
        members = build_dummy_members()
        roles = build_dummy_roles()
        role_assignments = build_dummy_role_assignments()
        tasks = build_dummy_tasks(base_date)
        checkins = build_dummy_checkins(base_date)
        return cls(
            members=members,
            roles=roles,
            role_assignments=role_assignments,
            tasks=tasks,
            checkins=checkins,
            settings=AppSettings(),
        )

    def list_members(self, active_only: bool = False) -> list[Member]:
        """メンバー一覧を取得する。"""
        items = (
            [m for m in self._members if m.active]
            if active_only
            else self._members
        )
        return deepcopy(items)

    def get_member_by_email(self, email: str) -> Member | None:
        """メールアドレス（小文字比較）でメンバーを検索する。"""
        normalized = email.strip().lower()
        for m in self._members:
            if m.email.strip().lower() == normalized:
                return deepcopy(m)
        return None

    def update_member_lang(self, member_id: str, lang: str) -> None:
        """メンバーの表示言語設定（ja / en）を更新する。"""
        for m in self._members:
            if m.member_id == member_id:
                m.lang = "en" if lang == "en" else "ja"
                return

    def list_roles(self, active_only: bool = False) -> list[Role]:
        """役職一覧を sort_order 順で取得する。"""
        items = (
            [r for r in self._roles if r.active] if active_only else self._roles
        )
        return deepcopy(sorted(items, key=lambda r: r.sort_order))

    def list_role_assignments(self) -> list[RoleAssignment]:
        """役職の担当割り当て一覧を取得する。"""
        return deepcopy(self._role_assignments)

    def get_settings(self) -> AppSettings:
        """settings シートの運用パラメータを取得する。"""
        return deepcopy(self._settings)

    def list_tasks(self, include_archived: bool = False) -> list[Task]:
        """タスク一覧を取得する。"""
        items = (
            self._tasks
            if include_archived
            else [t for t in self._tasks if not t.archived]
        )
        return deepcopy(items)

    def get_task(self, task_id: str) -> Task | None:
        """指定された task_id のタスクを取得する。"""
        for t in self._tasks:
            if t.task_id == task_id:
                return deepcopy(t)
        return None

    def add_task(self, task: Task) -> Task:
        """新しいタスクを追加する。すでに同じ task_id がある場合は ValueError。"""
        for existing in self._tasks:
            if existing.task_id == task.task_id:
                raise ValueError(f"Task ID {task.task_id} already exists.")
        copied = deepcopy(task)
        self._tasks.append(copied)
        return deepcopy(copied)

    def update_task(
        self, task: Task, expected_updated_at: datetime
    ) -> Task:
        """タスクを更新する。updated_at が expected_updated_at と一致しない場合は OptimisticLockError（S7）。"""
        for idx, existing in enumerate(self._tasks):
            if existing.task_id == task.task_id:
                if existing.updated_at != expected_updated_at:
                    raise OptimisticLockError(
                        f"タスク（{task.task_id}）は他のメンバーによって先に更新されました。"
                        "画面を再読み込みして最新の内容を確認してください。"
                    )
                copied = deepcopy(task)
                self._tasks[idx] = copied
                return deepcopy(copied)
        raise KeyError(f"Task not found: {task.task_id}")

    def list_checkins(
        self, member_id: str | None = None
    ) -> list[Checkin]:
        """体感負荷チェックイン履歴を日付昇順で取得する。"""
        items = (
            [c for c in self._checkins if c.member_id == member_id]
            if member_id
            else self._checkins
        )
        return deepcopy(sorted(items, key=lambda c: (c.date, c.checkin_id)))

    def save_checkin(self, checkin: Checkin) -> Checkin:
        """体感負荷を保存する。同じ人が同じ日に回答済みの場合は上書きする（4.5）。"""
        copied = deepcopy(checkin)
        for idx, existing in enumerate(self._checkins):
            if (
                existing.member_id == copied.member_id
                and existing.date == copied.date
            ):
                self._checkins[idx] = copied
                return deepcopy(copied)
        self._checkins.append(copied)
        return deepcopy(copied)

    def list_activity_logs(
        self, task_id: str | None = None
    ) -> list[ActivityLog]:
        """変更履歴を取得する。"""
        items = (
            [log for log in self._activity_logs if log.task_id == task_id]
            if task_id
            else self._activity_logs
        )
        return deepcopy(items)

    def add_activity_log(self, log: ActivityLog) -> None:
        """変更履歴を1件追加する。"""
        self._activity_logs.append(deepcopy(log))

    def list_meetings(self) -> list[Meeting]:
        """会議一覧を取得する。"""
        return deepcopy(self._meetings)

    def add_meeting(self, meeting: Meeting) -> None:
        """会議記録を1件追加する。"""
        self._meetings.append(deepcopy(meeting))

    def list_daily_snapshots(self) -> list[DailySnapshot]:
        """日次スナップショット一覧を取得する。"""
        return deepcopy(self._daily_snapshots)

    def save_daily_snapshots(
        self, snapshots: Iterable[DailySnapshot]
    ) -> None:
        """日次スナップショットを保存する。同じ（date, scope_type, scope_id）があれば上書きする（4.8）。"""
        for snap in snapshots:
            copied = deepcopy(snap)
            replaced = False
            for idx, existing in enumerate(self._daily_snapshots):
                if (
                    existing.date == copied.date
                    and existing.scope_type == copied.scope_type
                    and existing.scope_id == copied.scope_id
                ):
                    self._daily_snapshots[idx] = copied
                    replaced = True
                    break
            if not replaced:
                self._daily_snapshots.append(copied)

    def list_reminder_logs(
        self, date_key: str | None = None
    ) -> list[ReminderLog]:
        """送信済みリマインド履歴を取得する。"""
        items = (
            [r for r in self._reminder_logs if r.date_key == date_key]
            if date_key
            else self._reminder_logs
        )
        return deepcopy(items)

    def add_reminder_log(self, log: ReminderLog) -> None:
        """送信済みリマインド履歴を1件追加する。"""
        self._reminder_logs.append(deepcopy(log))


# ==============================================================================
# ダミー初期データの構築関数（要件定義書 4.2・フェーズ1-A 仕様準拠）
# ==============================================================================


def build_dummy_members() -> list[Member]:
    """メンバーA〜H（8名）のダミーデータを生成する（実在の氏名・メール・Slack IDを含めない）。"""
    return [
        Member(
            member_id="m001",
            display_name="メンバーA",
            display_name_en="Member A",
            email="member_a@example.com",
            main_roles=["r_chair"],
            lang="ja",
            slack_user_id="U00000001",
            reminders_enabled=True,
            is_admin=True,
            active=True,
        ),
        Member(
            member_id="m002",
            display_name="メンバーB",
            display_name_en="Member B",
            email="member_b@example.com",
            main_roles=["r_vice_chair"],
            lang="ja",
            slack_user_id="U00000002",
            reminders_enabled=True,
            is_admin=True,
            active=True,
        ),
        Member(
            member_id="m003",
            display_name="メンバーC",
            display_name_en="Member C",
            email="member_c@example.com",
            main_roles=["r_finance"],
            lang="ja",
            slack_user_id="U00000003",
            reminders_enabled=True,
            is_admin=False,
            active=True,
        ),
        Member(
            member_id="m004",
            display_name="メンバーD",
            display_name_en="Member D",
            email="member_d@example.com",
            main_roles=["r_pr"],
            lang="ja",
            slack_user_id="U00000004",
            reminders_enabled=True,
            is_admin=False,
            active=True,
        ),
        Member(
            member_id="m005",
            display_name="メンバーE",
            display_name_en="Member E",
            email="member_e@example.com",
            main_roles=["r_selection"],
            lang="ja",
            slack_user_id="U00000005",
            reminders_enabled=True,
            is_admin=False,
            active=True,
        ),
        Member(
            member_id="m006",
            display_name="メンバーF",
            display_name_en="Member F",
            email="member_f@example.com",
            main_roles=["r_finance"],
            lang="en",
            slack_user_id="U00000006",
            reminders_enabled=True,
            is_admin=False,
            active=True,
        ),
        Member(
            member_id="m007",
            display_name="メンバーG",
            display_name_en="Member G",
            email="member_g@example.com",
            main_roles=["r_pr"],
            lang="ja",
            slack_user_id="U00000007",
            reminders_enabled=False,
            is_admin=False,
            active=True,
        ),
        Member(
            member_id="m008",
            display_name="メンバーH",
            display_name_en="Member H",
            email="member_h@example.com",
            main_roles=["r_selection"],
            lang="ja",
            slack_user_id="",  # Slack ID 未設定のテストケース用（4.1）
            reminders_enabled=True,
            is_admin=False,
            active=True,
        ),
    ]


def build_dummy_roles() -> list[Role]:
    """4.2 roles の初期データ（全21役職＋英語名案）を生成する。"""
    raw_roles = [
        # 主役職
        ("r_chair", "実行委員長", "Chair", "主役職"),
        ("r_vice_chair", "副実行委員長", "Vice Chair", "主役職"),
        ("r_finance", "財務", "Finance", "主役職"),
        ("r_pr", "広報", "Public Relations", "主役職"),
        ("r_selection", "選考", "Selection", "主役職"),
        # 副役職
        ("r_spring_camp", "春合宿", "Spring Camp", "副役職"),
        ("r_security_study", "安全保障研修", "Security Field Trip", "副役職"),
        ("r_self_study", "自主研修", "Independent Study", "副役職"),
        ("r_pre_camp", "直前合宿", "Pre-Conference Camp", "副役職"),
        ("r_risk_mgmt", "リスクマネジメント", "Risk Management", "副役職"),
        ("r_comeback", "JASC COMEBACK", "JASC COMEBACK", "副役職"),
        ("r_ops_efficiency", "業務効率化", "Operations & Efficiency", "副役職"),
        ("r_regular_mtg", "定例会", "Regular Meetings", "副役職"),
        ("r_final_report", "報告書", "Final Report", "副役職"),
        ("r_kansai_ops", "関西業務", "Kansai Operations", "副役職"),
        ("r_debriefing", "報告会", "Debriefing Session", "副役職"),
        ("r_fukushima_study", "福島研修", "Fukushima Field Trip", "副役職"),
        # サイト（※「関西業務」と「関西サイト」は別の役職）
        ("r_site_tokyo", "東京サイト", "Tokyo Site", "サイト"),
        ("r_site_kansai", "関西サイト", "Kansai Site", "サイト"),
        ("r_site_iwate", "岩手サイト", "Iwate Site", "サイト"),
        # その他
        ("r_cvc", "CVC", "CVC", "その他"),
    ]
    return [
        Role(
            role_id=r_id,
            name=name_ja,
            name_en=name_en,
            category=cat,  # type: ignore[arg-type]
            sort_order=(idx + 1) * 10,
            active=True,
        )
        for idx, (r_id, name_ja, name_en, cat) in enumerate(raw_roles)
    ]


def build_dummy_role_assignments() -> list[RoleAssignment]:
    """各役職に1名の責任者と、担当・サポートを割り当てるダミーデータを生成する（4.3）。"""
    leaders = [
        ("r_chair", "m001"),
        ("r_vice_chair", "m002"),
        ("r_finance", "m003"),
        ("r_pr", "m004"),
        ("r_selection", "m005"),
        ("r_spring_camp", "m006"),
        ("r_security_study", "m007"),
        ("r_self_study", "m008"),
        ("r_pre_camp", "m002"),
        ("r_risk_mgmt", "m003"),
        ("r_comeback", "m004"),
        ("r_ops_efficiency", "m001"),
        ("r_regular_mtg", "m002"),
        ("r_final_report", "m005"),
        ("r_kansai_ops", "m006"),
        ("r_debriefing", "m007"),
        ("r_fukushima_study", "m008"),
        ("r_site_tokyo", "m001"),
        ("r_site_kansai", "m006"),
        ("r_site_iwate", "m003"),
        ("r_cvc", "m004"),
    ]
    assignments = [
        RoleAssignment(role_id=r_id, member_id=m_id, kind="責任者")
        for r_id, m_id in leaders
    ]
    # 担当・サポートの追加例
    assignments.extend(
        [
            RoleAssignment("r_selection", "m008", "担当"),
            RoleAssignment("r_finance", "m006", "担当"),
            RoleAssignment("r_pr", "m007", "担当"),
            RoleAssignment("r_site_iwate", "m008", "サポート"),
            RoleAssignment("r_ops_efficiency", "m002", "サポート"),
        ]
    )
    return assignments


def build_dummy_tasks(today: date) -> list[Task]:
    """30件のダミータスクを生成する。

    - 期限切れ・今週期限・2週間以内・15日以降・完了・依頼中・相談中・待ち・停滞を混ぜる。
    - メンバーA（m001）とメンバーC（m003）に高負荷が集中し、メンバーG・Hは負荷が軽くなるよう偏らせる。
    """

    def dt(days_offset: int, hour: int = 10) -> datetime:
        d = today + timedelta(days=days_offset)
        return datetime.combine(d, time(hour, 0), tzinfo=JST)

    specs: list[dict] = [
        # --- メンバーA (m001)：非常に高負荷（重・中が多数、期限切れ・今週期限・依頼中含む） ---
        {
            "task_id": "t001",
            "title": "全体年間スケジュールの最終確定",
            "role_ids": ["r_chair", "r_regular_mtg"],
            "owner": "m001",
            "weight": "重",
            "na": "米国側ECとオンライン日程調整の候補日を3つ送る",
            "na_due": today - timedelta(days=4),  # 期限切れ（エスカレーション対象）
            "status": "進行中",
            "updated": dt(-8),  # 停滞
        },
        {
            "task_id": "t002",
            "title": "東京サイト企業訪問アポ取り",
            "role_ids": ["r_site_tokyo"],
            "owner": "m001",
            "weight": "重",
            "na": "訪問候補3社の担当窓口へ依頼メール案を作成する",
            "na_due": today,  # 今日期限
            "status": "進行中",
            "updated": dt(-1),
        },
        {
            "task_id": "t003",
            "title": "業務効率化ツールの運用ルール案内",
            "role_ids": ["r_ops_efficiency"],
            "owner": "m001",
            "weight": "中",
            "na": "定例会スライドにアプリの使い方1枚を追加する",
            "na_due": today + timedelta(days=1),  # 明日期限
            "status": "未着手",
            "updated": dt(-2),
        },
        {
            "task_id": "t004",
            "title": "後援団体への挨拶状送付",
            "role_ids": ["r_chair"],
            "owner": "m001",
            "requested_by": "m002",
            "assignment_status": "依頼中",
            "weight": "中",
            "na": "昨年度の送付先リストを確認して宛名ラベルを作る",
            "na_due": today + timedelta(days=5),  # 今週期限
            "status": "未着手",
            "updated": dt(-3),  # 依頼の返事待ち（2日以上）
        },
        {
            "task_id": "t005",
            "title": "定例会第5回アジェンダ作成",
            "role_ids": ["r_regular_mtg"],
            "owner": "m001",
            "weight": "軽",
            "na": "各役職から議題を募るメッセージを投稿する",
            "na_due": today + timedelta(days=10),  # 2週間以内
            "status": "未着手",
            "updated": dt(-1),
        },
        {
            "task_id": "t006",
            "title": "キックオフ議事録のアーカイブ整理",
            "role_ids": ["r_chair"],
            "owner": "m001",
            "weight": "軽",
            "na": "共有ドライブのフォルダ構成を整理する",
            "na_due": today - timedelta(days=5),
            "status": "完了",
            "completed_at": dt(-4),
            "updated": dt(-4),
        },
        # --- メンバーC (m003)：高負荷（財務・岩手サイト・リスク管理） ---
        {
            "task_id": "t007",
            "title": "前期予算案の策定とヒアリング",
            "role_ids": ["r_finance"],
            "owner": "m003",
            "weight": "重",
            "na": "各副役職の予算要望シートを集計する",
            "na_due": today - timedelta(days=2),  # 期限切れ
            "status": "進行中",
            "updated": dt(-2),
        },
        {
            "task_id": "t008",
            "title": "岩手サイト宿泊施設の仮予約",
            "role_ids": ["r_site_iwate", "r_finance"],
            "owner": "m003",
            "weight": "重",
            "na": "宿泊候補2施設へ人数と日程を伝えて見積を取る",
            "na_due": today + timedelta(days=2),  # 今週期限
            "status": "進行中",
            "updated": dt(-1),
        },
        {
            "task_id": "t009",
            "title": "緊急連絡網フォーマットの更新",
            "role_ids": ["r_risk_mgmt"],
            "owner": "m003",
            "weight": "中",
            "na": "合宿用の緊急連絡カードひな形を作成する",
            "na_due": today + timedelta(days=4),  # 今週期限
            "status": "待ち",
            "waiting_on": "m002",
            "blocker": "副実行委員長の確認待ち",
            "updated": dt(-3),
        },
        {
            "task_id": "t010",
            "title": "助成金申請書類の下書き",
            "role_ids": ["r_finance"],
            "owner": "m003",
            "requested_by": "m001",
            "assignment_status": "依頼中",
            "weight": "重",
            "na": "昨年度の申請書を参考に事業計画欄を埋める",
            "na_due": today + timedelta(days=9),
            "status": "未着手",
            "updated": dt(-1),
        },
        {
            "task_id": "t011",
            "title": "口座名義変更の手続き確認",
            "role_ids": ["r_finance"],
            "owner": "m003",
            "weight": "軽",
            "na": "銀行窓口で必要書類を確認する",
            "na_due": today - timedelta(days=3),
            "status": "完了",
            "completed_at": dt(-2),
            "updated": dt(-2),
        },
        # --- メンバーB (m002)：中程度の負荷（副委員長・直前合宿・定例会） ---
        {
            "task_id": "t012",
            "title": "直前合宿の会場候補リストアップ",
            "role_ids": ["r_pre_camp"],
            "owner": "m002",
            "weight": "中",
            "na": "都内近郊の研修施設3か所の空き状況を調べる",
            "na_due": today + timedelta(days=3),
            "status": "進行中",
            "updated": dt(-2),
        },
        {
            "task_id": "t013",
            "title": "各分科会テーマ案の初期すり合わせ",
            "role_ids": ["r_vice_chair"],
            "owner": "m002",
            "requested_by": "m001",
            "assignment_status": "相談中",
            "assignment_comment": "今週は直前合宿の会場調査が重なっているため、来週以降の着手でもよいか相談したいです",
            "weight": "重",
            "na": "分科会リーダー候補と15分ずつ面談する",
            "na_due": today + timedelta(days=6),
            "status": "未着手",
            "updated": dt(-1),
        },
        {
            "task_id": "t014",
            "title": "定例会の議事進行ローテーション作成",
            "role_ids": ["r_regular_mtg"],
            "owner": "m002",
            "weight": "軽",
            "na": "3月までの書記・タイムキーパー表をシートに作る",
            "na_due": today - timedelta(days=6),
            "status": "完了",
            "completed_at": dt(-5),
            "updated": dt(-5),
        },
        {
            "task_id": "t015",
            "title": "米国側副委員長との月次ミーティング設定",
            "role_ids": ["r_vice_chair"],
            "owner": "m002",
            "weight": "軽",
            "na": "来月第1週の候補日時を連絡する",
            "na_due": today + timedelta(days=18),  # 14日超（自動負荷対象外）
            "status": "未着手",
            "updated": dt(-1),
        },
        # --- メンバーD (m004)：中程度の負荷（広報・COMEBACK・CVC） ---
        {
            "task_id": "t016",
            "title": "新歓・参加者募集SNS投稿カレンダー作成",
            "role_ids": ["r_pr"],
            "owner": "m004",
            "weight": "中",
            "na": "InstagramとXの週次投稿テーマを表にまとめる",
            "na_due": today - timedelta(days=1),  # 期限切れ
            "status": "進行中",
            "updated": dt(-9),  # 停滞
        },
        {
            "task_id": "t017",
            "title": "JASC COMEBACK 企画案の骨子作成",
            "role_ids": ["r_comeback", "r_pr"],
            "owner": "m004",
            "weight": "中",
            "na": "過去の参加者にインタビュー企画の打診文を作る",
            "na_due": today + timedelta(days=5),
            "status": "未着手",
            "updated": dt(-2),
        },
        {
            "task_id": "t018",
            "title": "CVC 連携イベントの企画書確認",
            "role_ids": ["r_cvc"],
            "owner": "m004",
            "weight": "軽",
            "na": "先方から届いた企画案を読んでコメントを返す",
            "na_due": today + timedelta(days=12),
            "status": "待ち",
            "waiting_on": "m001",
            "blocker": "委員長の方向性コメント待ち",
            "updated": dt(-2),
        },
        {
            "task_id": "t019",
            "title": "公式Webサイトの募集要項ページ更新",
            "role_ids": ["r_pr", "r_selection"],
            "owner": "m004",
            "weight": "中",
            "na": "応募締切日の表記を最新に差し替える",
            "na_due": today - timedelta(days=2),
            "status": "完了",
            "completed_at": dt(-1),
            "updated": dt(-1),
        },
        # --- メンバーE (m005)：選考・報告書 ---
        {
            "task_id": "t020",
            "title": "一次選考の評価ルーブリック作成",
            "role_ids": ["r_selection"],
            "owner": "m005",
            "weight": "重",
            "na": "エッセイ評価基準の素案を作って選考チームに共有する",
            "na_due": today + timedelta(days=3),
            "status": "進行中",
            "updated": dt(-1),
        },
        {
            "task_id": "t021",
            "title": "面接選考官のシフト表作成",
            "role_ids": ["r_selection"],
            "owner": "m005",
            "requested_by": "m001",
            "assignment_status": "依頼中",
            "weight": "中",
            "na": "全実行委員の土日空き日程アンケートフォームを作る",
            "na_due": today + timedelta(days=7),  # 今週期限の境界（+7日）
            "status": "未着手",
            "updated": dt(-4),  # 依頼の返事待ち
        },
        {
            "task_id": "t022",
            "title": "昨年度報告書の在庫確認と発送準備",
            "role_ids": ["r_final_report"],
            "owner": "m005",
            "weight": "軽",
            "na": "保管場所の冊数を数えてシートに記録する",
            "na_due": today + timedelta(days=14),  # 自動負荷の境界（+14日）
            "status": "未着手",
            "updated": dt(-2),
        },
        # --- メンバーF (m006)：春合宿・関西業務・関西サイト ---
        {
            "task_id": "t023",
            "title": "春合宿の研修プログラム時間割の設計",
            "role_ids": ["r_spring_camp"],
            "owner": "m006",
            "weight": "中",
            "na": "3日間のコマ割り案をスプレッドシートに作成する",
            "na_due": today + timedelta(days=4),
            "status": "進行中",
            "updated": dt(-1),
        },
        {
            "task_id": "t024",
            "title": "関西業務：関西地区説明会の教室手配",
            "role_ids": ["r_kansai_ops"],
            "owner": "m006",
            "weight": "中",
            "na": "大学施設課に教室借用申請書の提出期限を確認する",
            "na_due": today + timedelta(days=8),  # 今週期限外（+8日）だが14日以内
            "status": "未着手",
            "updated": dt(-2),
        },
        {
            "task_id": "t025",
            "title": "関西サイト：京都フィールドワーク先の選定",
            "role_ids": ["r_site_kansai"],
            "owner": "m006",
            "requested_by": "m002",
            "assignment_status": "相談中",
            "assignment_comment": "関西業務の説明会準備と時期が重なるため、メンバーGにも分担できるか相談したいです",
            "weight": "中",
            "na": "訪問先候補を3件リストアップする",
            "na_due": today + timedelta(days=11),
            "status": "未着手",
            "updated": dt(-1),
        },
        # --- メンバーG (m007)：自動負荷は軽いが体感負荷が高い（ずれのテストケース） ---
        {
            "task_id": "t026",
            "title": "安全保障研修の事前学習文献リスト作成",
            "role_ids": ["r_security_study"],
            "owner": "m007",
            "weight": "軽",
            "na": "推薦図書3冊の要約メモを作成する",
            "na_due": today + timedelta(days=6),
            "status": "進行中",
            "updated": dt(-2),
        },
        {
            "task_id": "t027",
            "title": "報告会会場の候補リスト作成",
            "role_ids": ["r_debriefing"],
            "owner": "m007",
            "weight": "中",
            "na": "100名規模のホール3か所の料金表を集める",
            "na_due": today + timedelta(days=20),  # 15日以降なので自動負荷対象外
            "status": "未着手",
            "updated": dt(-1),
        },
        {
            "task_id": "t028",
            "title": "広報用パンフレットの写真選定",
            "role_ids": ["r_pr"],
            "owner": "m007",
            "weight": "軽",
            "na": "昨年度の写真フォルダから候補10枚を選ぶ",
            "na_due": today - timedelta(days=3),
            "status": "完了",
            "completed_at": dt(-2),
            "updated": dt(-2),
        },
        # --- メンバーH (m008)：自主研修・福島研修（軽負荷） ---
        {
            "task_id": "t029",
            "title": "自主研修チームのテーマ募集フォーム作成",
            "role_ids": ["r_self_study"],
            "owner": "m008",
            "weight": "軽",
            "na": "Googleフォームで希望テーマ調査を作成する",
            "na_due": today + timedelta(days=5),
            "status": "進行中",
            "updated": dt(-1),
        },
        {
            "task_id": "t030",
            "title": "福島研修の視察先候補の資料収集",
            "role_ids": ["r_fukushima_study"],
            "owner": "m008",
            "weight": "中",
            "na": "過去の視察先リストを確認して連絡先を整理する",
            "na_due": today + timedelta(days=15),  # 境界（+15日は14日窓の外）
            "status": "未着手",
            "updated": dt(-1),
        },
    ]

    tasks: list[Task] = []
    for item in specs:
        created_dt = item["updated"] - timedelta(days=2)
        tasks.append(
            Task(
                task_id=item["task_id"],
                title=item["title"],
                role_ids=item["role_ids"],
                owner_member_id=item["owner"],
                requested_by=item.get("requested_by", ""),
                assignment_status=item.get("assignment_status", "承諾済"),
                assignment_comment=item.get("assignment_comment", ""),
                weight=item["weight"],
                next_action=item["na"],
                na_due=item["na_due"],
                task_due=item["na_due"] + timedelta(days=7),
                status=item["status"],
                waiting_on_member_id=item.get("waiting_on", ""),
                priority="高" if item["weight"] == "重" else "中",
                blocker=item.get("blocker", ""),
                notes="",
                source="manual",
                meeting_id="",
                completed_at=item.get("completed_at"),
                completed_by=item["owner"] if item["status"] == "完了" else "",
                created_at=created_dt,
                created_by=item.get("requested_by") or item["owner"],
                updated_at=item["updated"],
                updated_by=item["owner"],
                archived=False,
            )
        )
    return tasks


def build_dummy_checkins(today: date) -> list[Checkin]:
    """過去4週分の体感負荷（checkins）ダミーデータを生成する。

    - メンバーA (m001)：直近2回連続で 8 以上（アラート対象 5.4）
    - メンバーG (m007)：自動負荷は低いが体感負荷が 8（自動負荷との「ずれ」対象 5.4）
    - メンバーH (m008)：最後の回答が10日前（7日以上経過で「未回答」扱い 5.4）
    """
    offsets = [-21, -14, -7, -2]
    member_histories: dict[str, list[tuple[int, int, str]]] = {
        "m001": [
            (-21, 6, "順調です"),
            (-14, 7, "少し立て込んできました"),
            (-7, 8, "日程調整が重なっています"),
            (-2, 9, "東京サイトと全体調整が山場です"),
        ],
        "m002": [
            (-21, 5, ""),
            (-14, 5, ""),
            (-7, 6, "直前合宿の調査中"),
            (-2, 6, "落ち着いています"),
        ],
        "m003": [
            (-21, 6, ""),
            (-14, 7, "予算集計中"),
            (-7, 8, "岩手の見積対応中"),
            (-2, 7, "山場は越えそうです"),
        ],
        "m004": [
            (-21, 4, ""),
            (-14, 5, ""),
            (-7, 5, "SNSカレンダー作成中"),
            (-2, 5, ""),
        ],
        "m005": [
            (-21, 5, ""),
            (-14, 6, ""),
            (-7, 6, "選考基準を作成中"),
            (-2, 6, ""),
        ],
        "m006": [
            (-21, 4, ""),
            (-14, 5, ""),
            (-7, 6, "春合宿と関西業務を並行中"),
            (-2, 6, ""),
        ],
        "m007": [
            (-21, 3, "余裕があります"),
            (-14, 4, ""),
            (-7, 7, "大学の試験準備が始まりました"),
            (-2, 8, "来週テストが重なっています"),
        ],
        "m008": [
            (-28, 3, ""),
            (-21, 3, ""),
            (-14, 4, ""),
            (-10, 3, "余裕があります"),
        ],
    }

    checkins: list[Checkin] = []
    counter = 1
    for member_id, entries in member_histories.items():
        for days_ago, score, comment in entries:
            c_date = today + timedelta(days=days_ago)
            checkins.append(
                Checkin(
                    checkin_id=f"c{counter:03d}",
                    member_id=member_id,
                    date=c_date,
                    score=score,
                    comment=comment,
                    auto_load_at_checkin=5,
                )
            )
            counter += 1
    return checkins


def build_dummy_daily_snapshots(
    today: date,
    members: list[Member] | None = None,
    roles: list[Role] | None = None,
) -> list[DailySnapshot]:
    """F13 進捗グラフ確認用の過去12週分（週次12点）のダミー DailySnapshot を生成する。"""
    member_list = members or build_dummy_members()
    role_list = roles or build_dummy_roles()
    snapshots: list[DailySnapshot] = []

    base_member_loads = {
        "m001": [5, 6, 7, 8, 7, 8, 9, 10, 9, 10, 11, 11],
        "m002": [3, 4, 4, 5, 5, 6, 5, 6, 5, 5, 5, 5],
        "m003": [4, 5, 6, 6, 7, 8, 8, 9, 9, 10, 10, 11],
        "m004": [2, 3, 3, 4, 4, 5, 5, 4, 5, 5, 5, 5],
        "m005": [3, 3, 4, 4, 5, 5, 6, 6, 6, 5, 6, 6],
        "m006": [2, 3, 4, 4, 5, 5, 5, 6, 6, 6, 6, 6],
        "m007": [2, 2, 3, 3, 2, 2, 2, 1, 1, 2, 1, 1],
        "m008": [1, 2, 2, 2, 3, 2, 2, 2, 1, 1, 1, 1],
    }

    for idx in range(12):
        weeks_ago = 11 - idx
        snap_date = today - timedelta(days=weeks_ago * 7)
        total_all = 18 + idx
        done_all = max(1, int(total_all * (0.1 + idx * 0.05)))
        open_all = total_all - done_all
        overdue_all = max(0, 4 - (idx // 4))
        rate_all = round(done_all / total_all, 3)

        snapshots.append(
            DailySnapshot(
                date=snap_date,
                scope_type="ALL",
                scope_id="",
                total=total_all,
                done=done_all,
                open=open_all,
                overdue=overdue_all,
                completion_rate=rate_all,
                auto_load=None,
            )
        )

        for r_idx, role in enumerate(role_list):
            if not role.active:
                continue
            r_total = 2 + (r_idx % 3)
            r_done = min(r_total, (idx + r_idx) // 5)
            r_open = r_total - r_done
            r_overdue = 1 if (r_open > 0 and r_idx % 5 == 0) else 0
            snapshots.append(
                DailySnapshot(
                    date=snap_date,
                    scope_type="role",
                    scope_id=role.role_id,
                    total=r_total,
                    done=r_done,
                    open=r_open,
                    overdue=r_overdue,
                    completion_rate=round(r_done / r_total, 3),
                    auto_load=None,
                )
            )

        for member in member_list:
            if not member.active:
                continue
            series = base_member_loads.get(member.member_id, [3] * 12)
            m_load = series[idx]
            m_total = 4
            m_done = min(3, idx // 4)
            snapshots.append(
                DailySnapshot(
                    date=snap_date,
                    scope_type="member",
                    scope_id=member.member_id,
                    total=m_total,
                    done=m_done,
                    open=m_total - m_done,
                    overdue=1 if m_load >= 9 else 0,
                    completion_rate=round(m_done / m_total, 3),
                    auto_load=m_load,
                )
            )

    return snapshots

