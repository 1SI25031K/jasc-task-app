"""5.5 期限・停滞の判定と、役職ボード（F2）用の集計ロジック。"""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import date, datetime, time, timedelta
from typing import Iterable
import uuid

from core.assignments import determine_initial_assignment
from core.load import calc_member_auto_load, get_latest_checkin
from core.models import (
    ActivityLog,
    Checkin,
    LangCode,
    Member,
    Role,
    RoleAssignment,
    Task,
    TaskPriority,
    TaskSource,
    TaskStatus,
    TaskWeight,
    format_comma_ids,
)
from core.settings import AppSettings


def is_overdue_na(task: Task, today: date) -> bool:
    """期限切れ NA かどうかを判定する（5.5：status ≠ 完了、未アーカイブ、na_due < 今日）。"""
    if task.archived or task.status == "完了":
        return False
    return task.na_due < today


def is_due_this_week(task: Task, today: date) -> bool:
    """今週期限の NA かどうかを判定する（5.5：status ≠ 完了、未アーカイブ、今日 <= na_due <= 今日+7日）。"""
    if task.archived or task.status == "完了":
        return False
    return today <= task.na_due <= today + timedelta(days=7)


def get_overdue_tasks(
    tasks: Iterable[Task], today: date, member_id: str | None = None
) -> list[Task]:
    """期限切れ NA を持つタスクの一覧を返す（5.5 準拠：status ≠ 完了、未アーカイブ、na_due < 今日）。"""
    res = [t for t in tasks if is_overdue_na(t, today)]
    if member_id is not None:
        res = [t for t in res if t.owner_member_id == member_id]
    return sorted(res, key=lambda x: (x.na_due, x.task_id))


def get_due_this_week_tasks(
    tasks: Iterable[Task], today: date, member_id: str | None = None
) -> list[Task]:
    """今週期限の NA を持つタスクの一覧を返す（5.5 準拠：status ≠ 完了、未アーカイブ、今日 <= na_due <= 今日+7日）。"""
    res = [t for t in tasks if is_due_this_week(t, today)]
    if member_id is not None:
        res = [t for t in res if t.owner_member_id == member_id]
    return sorted(res, key=lambda x: (x.na_due, x.task_id))


def is_stale_task(
    task: Task, now: datetime, stale_days: int = 7
) -> bool:
    """停滞タスクかどうかを判定する（5.5：status ≠ 完了、未アーカイブ、updated_at が stale_days 日以上前）。"""
    if task.archived or task.status == "完了":
        return False
    return (now - task.updated_at) >= timedelta(days=stale_days)


def calc_completion_rate(tasks: Iterable[Task]) -> float | None:
    """アーカイブを除くタスク群の完了率（0.0〜1.0）を返す。対象が0件なら None を返す（5.5）。"""
    active_tasks = [t for t in tasks if not t.archived]
    total = len(active_tasks)
    if total == 0:
        return None
    done_count = sum(1 for t in active_tasks if t.status == "完了")
    return done_count / total


def format_completion_rate(rate: float | None) -> str:
    """完了率を画面表示用の文字列（例：'75%' または '—'）に整形する。"""
    if rate is None:
        return "—"
    return f"{round(rate * 100)}%"


@dataclass
class RoleBoardSummary:
    """F2 役職ボードの各カードに表示する集計情報。"""

    role: Role
    lead_member: Member | None
    open_task_count: int
    overdue_na_count: int
    due_this_week_na_count: int
    nearest_na_task: Task | None


def build_role_board_summaries(
    roles: Iterable[Role],
    members: Iterable[Member],
    role_assignments: Iterable[RoleAssignment],
    tasks: Iterable[Task],
    today: date,
) -> list[RoleBoardSummary]:
    """active な役職ごとに、責任者・未完了数・期限切れ数・今週期限数・最短期限NAを集計する（F2）。"""
    member_map: dict[str, Member] = {m.member_id: m for m in members}
    lead_by_role: dict[str, Member] = {}
    for assignment in role_assignments:
        if assignment.kind == "責任者" and assignment.member_id in member_map:
            lead_by_role[assignment.role_id] = member_map[assignment.member_id]

    active_tasks = [t for t in tasks if not t.archived]
    active_roles = sorted(
        (r for r in roles if r.active), key=lambda r: r.sort_order
    )

    summaries: list[RoleBoardSummary] = []
    for role in active_roles:
        role_open_tasks = [
            t
            for t in active_tasks
            if role.role_id in t.role_ids and t.status != "完了"
        ]
        overdue_count = sum(
            1 for t in role_open_tasks if is_overdue_na(t, today)
        )
        due_week_count = sum(
            1 for t in role_open_tasks if is_due_this_week(t, today)
        )
        nearest_task = (
            min(role_open_tasks, key=lambda t: (t.na_due, t.task_id))
            if role_open_tasks
            else None
        )
        summaries.append(
            RoleBoardSummary(
                role=role,
                lead_member=lead_by_role.get(role.role_id),
                open_task_count=len(role_open_tasks),
                overdue_na_count=overdue_count,
                due_this_week_na_count=due_week_count,
                nearest_na_task=nearest_task,
            )
        )
    return summaries


def build_member_load_label(
    member: Member,
    tasks: Iterable[Task],
    checkins: Iterable[Checkin],
    today: date,
    lang: LangCode = "ja",
    settings: AppSettings | None = None,
) -> str:
    """F7・F8・F14 の担当者選択肢用に「名前（自動 Xpt／体感 Y）」形式の文字列を作る。"""
    from core.i18n import t

    auto_pt = calc_member_auto_load(member.member_id, tasks, today, settings)
    latest_c, is_fresh = get_latest_checkin(member.member_id, checkins, today)
    subj_str = (
        str(latest_c.score)
        if (latest_c is not None and is_fresh)
        else t("common.unanswered", lang)
    )
    return t(
        "common.owner_option_format",
        lang,
        name=member.get_name(lang),
        auto_pt=auto_pt,
        subj=subj_str,
    )


def count_pending_requests_for_member(
    member_id: str, tasks: Iterable[Task]
) -> int:
    """指定メンバー宛てで現在「依頼中」かつ未完了・未アーカイブのタスク件数を返す（F2上部バナー用）。"""
    return sum(
        1
        for t in tasks
        if not t.archived
        and t.status != "完了"
        and t.owner_member_id == member_id
        and t.assignment_status == "依頼中"
    )


def is_checkin_unanswered_for_member(
    member_id: str,
    checkins: Iterable[Checkin],
    today: date,
    settings: AppSettings | None = None,
) -> bool:
    """F2上部のお知らせ「体感負荷が未回答です」を出すべきか判定する。

    - 最後の回答から7日以上経過している（または一度も回答していない）、または
    - 今日が checkin_weekdays の曜日で、今日まだ回答していない場合に True。
    """
    from core.reminders import get_japanese_weekday

    cfg = settings or AppSettings()
    latest, is_fresh = get_latest_checkin(member_id, checkins, today)
    if latest is None or not is_fresh:
        return True
    weekday_ja = get_japanese_weekday(today)
    if weekday_ja in cfg.checkin_weekdays and latest.date < today:
        return True
    return False


def create_new_task(
    *,
    title: str,
    role_ids: list[str],
    owner_member_id: str,
    creator_member_id: str,
    weight: TaskWeight,
    next_action: str,
    na_due: date,
    now: datetime,
    task_due: date | None = None,
    status: TaskStatus = "未着手",
    waiting_on_member_id: str = "",
    priority: TaskPriority = "中",
    blocker: str = "",
    notes: str = "",
    source: TaskSource = "manual",
    meeting_id: str = "",
    task_id: str | None = None,
) -> tuple[Task, list[ActivityLog]]:
    """F7 タスクを新規作成し、初期の依頼状態（5.3）と変更履歴（F10）を生成する。"""
    clean_title = title.strip()
    clean_na = next_action.strip()
    clean_roles = [r.strip() for r in role_ids if r.strip()]
    if not clean_title or not clean_na or not clean_roles:
        raise ValueError(
            "タイトル、関係する役職（1つ以上）、次のアクション（NA）は必須です。"
        )

    assign_status, requested_by = determine_initial_assignment(
        creator_member_id=creator_member_id,
        owner_member_id=owner_member_id,
    )
    new_id = task_id or f"t_{uuid.uuid4().hex[:8]}"
    completed_at = now if status == "完了" else None
    completed_by = creator_member_id if status == "完了" else ""

    task = Task(
        task_id=new_id,
        title=clean_title,
        role_ids=clean_roles,
        owner_member_id=owner_member_id,
        requested_by=requested_by,
        assignment_status=assign_status,
        assignment_comment="",
        weight=weight,
        next_action=clean_na,
        na_due=na_due,
        task_due=task_due,
        status=status,
        waiting_on_member_id=waiting_on_member_id if status == "待ち" else "",
        priority=priority,
        blocker=blocker.strip(),
        notes=notes.strip(),
        source=source,
        meeting_id=meeting_id,
        completed_at=completed_at,
        completed_by=completed_by,
        created_at=now,
        created_by=creator_member_id,
        updated_at=now,
        updated_by=creator_member_id,
        archived=False,
    )

    action_type = (
        "create_from_minutes" if source == "minutes" else "create"
    )
    logs: list[ActivityLog] = [
        ActivityLog(
            timestamp=now,
            member_id=creator_member_id,
            task_id=new_id,
            action=action_type,  # type: ignore[arg-type]
            field="title",
            old_value="",
            new_value=clean_title,
        )
    ]
    if assign_status == "依頼中":
        logs.append(
            ActivityLog(
                timestamp=now,
                member_id=creator_member_id,
                task_id=new_id,
                action="request",
                field="owner_member_id",
                old_value="",
                new_value=owner_member_id,
            )
        )
    return task, logs


def apply_quick_na_update(
    task: Task,
    next_action: str,
    na_due: date,
    status: TaskStatus,
    actor_member_id: str,
    now: datetime,
) -> tuple[Task, list[ActivityLog]]:
    """F8 「NA を更新」簡易フォームの変更を適用し、差分のみ変更履歴（F10）を生成する。"""
    clean_na = next_action.strip()
    if not clean_na:
        raise ValueError("次のアクション（NA）は必須です。")

    logs: list[ActivityLog] = []
    if task.next_action != clean_na:
        logs.append(
            ActivityLog(
                timestamp=now,
                member_id=actor_member_id,
                task_id=task.task_id,
                action="update",
                field="next_action",
                old_value=task.next_action,
                new_value=clean_na,
            )
        )
    if task.na_due != na_due:
        logs.append(
            ActivityLog(
                timestamp=now,
                member_id=actor_member_id,
                task_id=task.task_id,
                action="update",
                field="na_due",
                old_value=task.na_due.isoformat(),
                new_value=na_due.isoformat(),
            )
        )
    completed_at = task.completed_at
    completed_by = task.completed_by
    if task.status != status:
        logs.append(
            ActivityLog(
                timestamp=now,
                member_id=actor_member_id,
                task_id=task.task_id,
                action="update",
                field="status",
                old_value=task.status,
                new_value=status,
            )
        )
        if status == "完了":
            completed_at = now
            completed_by = actor_member_id
        else:
            completed_at = None
            completed_by = ""

    updated_task = replace(
        task,
        next_action=clean_na,
        na_due=na_due,
        status=status,
        completed_at=completed_at,
        completed_by=completed_by,
        updated_at=now,
        updated_by=actor_member_id,
    )
    return updated_task, logs


def apply_full_task_update(
    task: Task,
    *,
    title: str,
    role_ids: list[str],
    owner_member_id: str,
    weight: TaskWeight,
    next_action: str,
    na_due: date,
    task_due: date | None,
    status: TaskStatus,
    waiting_on_member_id: str,
    priority: TaskPriority,
    blocker: str,
    notes: str,
    actor_member_id: str,
    now: datetime,
    force_rerequest: bool = False,
) -> tuple[Task, list[ActivityLog]]:
    """F8 全項目の編集を適用する。担当者が変更された場合（または相談中からの再依頼時）は 5.3 に従い依頼状態を更新する。"""
    clean_title = title.strip()
    clean_na = next_action.strip()
    clean_roles = [r.strip() for r in role_ids if r.strip()]
    if not clean_title or not clean_na or not clean_roles:
        raise ValueError(
            "タイトル、関係する役職（1つ以上）、次のアクション（NA）は必須です。"
        )

    logs: list[ActivityLog] = []

    def _record_diff(field_name: str, old_val: str, new_val: str) -> None:
        if old_val != new_val:
            logs.append(
                ActivityLog(
                    timestamp=now,
                    member_id=actor_member_id,
                    task_id=task.task_id,
                    action="update",
                    field=field_name,
                    old_value=old_val,
                    new_value=new_val,
                )
            )

    _record_diff("title", task.title, clean_title)
    _record_diff(
        "role_ids", format_comma_ids(task.role_ids), format_comma_ids(clean_roles)
    )
    _record_diff("weight", task.weight, weight)
    _record_diff("next_action", task.next_action, clean_na)
    _record_diff("na_due", task.na_due.isoformat(), na_due.isoformat())
    _record_diff(
        "task_due",
        task.task_due.isoformat() if task.task_due else "",
        task_due.isoformat() if task_due else "",
    )
    _record_diff("status", task.status, status)
    _record_diff("priority", task.priority, priority)
    clean_waiting = waiting_on_member_id if status == "待ち" else ""
    _record_diff("waiting_on_member_id", task.waiting_on_member_id, clean_waiting)
    _record_diff("blocker", task.blocker, blocker.strip())
    _record_diff("notes", task.notes, notes.strip())

    assign_status = task.assignment_status
    requested_by = task.requested_by
    assign_comment = task.assignment_comment

    if owner_member_id != task.owner_member_id or force_rerequest:
        assign_status, requested_by = determine_initial_assignment(
            creator_member_id=actor_member_id,
            owner_member_id=owner_member_id,
        )
        assign_comment = ""
        logs.append(
            ActivityLog(
                timestamp=now,
                member_id=actor_member_id,
                task_id=task.task_id,
                action="request" if assign_status == "依頼中" else "update",
                field="owner_member_id",
                old_value=f"{task.owner_member_id}({task.assignment_status})",
                new_value=f"{owner_member_id}({assign_status})",
            )
        )

    completed_at = task.completed_at
    completed_by = task.completed_by
    if task.status != status:
        if status == "完了":
            completed_at = now
            completed_by = actor_member_id
        else:
            completed_at = None
            completed_by = ""

    updated_task = replace(
        task,
        title=clean_title,
        role_ids=clean_roles,
        owner_member_id=owner_member_id,
        requested_by=requested_by,
        assignment_status=assign_status,
        assignment_comment=assign_comment,
        weight=weight,
        next_action=clean_na,
        na_due=na_due,
        task_due=task_due,
        status=status,
        waiting_on_member_id=clean_waiting,
        priority=priority,
        blocker=blocker.strip(),
        notes=notes.strip(),
        completed_at=completed_at,
        completed_by=completed_by,
        updated_at=now,
        updated_by=actor_member_id,
    )
    return updated_task, logs


def toggle_archive_task(
    task: Task, archived: bool, actor_member_id: str, now: datetime
) -> tuple[Task, ActivityLog]:
    """F9 タスクをアーカイブまたは復元し、変更履歴（F10）を生成する。"""
    action_type = "archive" if archived else "restore"
    updated_task = replace(
        task,
        archived=archived,
        updated_at=now,
        updated_by=actor_member_id,
    )
    log = ActivityLog(
        timestamp=now,
        member_id=actor_member_id,
        task_id=task.task_id,
        action=action_type,  # type: ignore[arg-type]
        field="archived",
        old_value=str(task.archived),
        new_value=str(archived),
    )
    return updated_task, log


def filter_tasks(
    tasks: Iterable[Task],
    *,
    role_id: str = "",
    owner_member_id: str = "",
    status: str = "",
    assignment_status: str = "",
    source: str = "",
    keyword: str = "",
    show_archived: bool = False,
) -> list[Task]:
    """F6 全タスク一覧の絞り込みを行う。"""
    kw = keyword.strip().lower()
    results: list[Task] = []
    for t in tasks:
        if not show_archived and t.archived:
            continue
        if role_id and role_id not in t.role_ids:
            continue
        if owner_member_id and t.owner_member_id != owner_member_id:
            continue
        if status and t.status != status:
            continue
        if assignment_status and t.assignment_status != assignment_status:
            continue
        if source and t.source != source:
            continue
        if kw:
            haystack = f"{t.title} {t.next_action} {t.notes} {t.blocker}".lower()
            if kw not in haystack:
                continue
        results.append(t)
    return sorted(results, key=lambda item: (item.na_due, item.task_id))


def get_greeting_key(now_time: datetime | time) -> str:
    """現在時刻（Asia/Tokyo）から挨拶キー（'morning' / 'afternoon' / 'evening'）を判定する。

    - 5:00 〜 10:59: 'morning'（おはようございます）
    - 11:00 〜 17:59: 'afternoon'（こんにちは）
    - 18:00 〜 翌4:59: 'evening'（こんばんは）
    """
    t = now_time.time() if isinstance(now_time, datetime) else now_time
    if time(5, 0) <= t < time(11, 0):
        return "morning"
    if time(11, 0) <= t < time(18, 0):
        return "afternoon"
    return "evening"


def build_home_summary(
    member_id: str,
    tasks: Iterable[Task],
    today: date,
    lang: LangCode = "ja",
) -> str:
    """ホーム画面に表示するログイン中メンバーの状況1行サマリーを構築する（5.5 判定ルール準拠）。"""
    all_tasks = list(tasks)
    # 5.5 判定ルール（status ≠ 完了、未アーカイブ、na_due < 今日）に統一
    overdue_count = len(get_overdue_tasks(all_tasks, today))
    # 5.5 判定ルール（status ≠ 完了、未アーカイブ、今日 <= na_due <= 今日+7日）に統一
    due_week_count = len(get_due_this_week_tasks(all_tasks, today))

    requests_count = sum(
        1
        for t in all_tasks
        if t.owner_member_id == member_id
        and not t.archived
        and t.assignment_status in ("依頼中", "相談中")
        and t.requested_by != member_id
    )

    parts: list[str] = []
    if lang == "en":
        if overdue_count > 0:
            parts.append(
                f"{overdue_count} NA{'s' if overdue_count > 1 else ''} past due"
            )
        if due_week_count > 0:
            parts.append(
                f"{due_week_count} NA{'s' if due_week_count > 1 else ''} due this week"
            )
        if requests_count > 0:
            parts.append(
                f"{requests_count} request{'s' if requests_count > 1 else ''} for you"
            )

        if not parts:
            return "All caught up! No urgent tasks or requests pending."
        return " · ".join(parts)
    else:
        if overdue_count > 0:
            parts.append(f"期限を過ぎた NA {overdue_count}件")
        if due_week_count > 0:
            parts.append(f"今週期限の NA {due_week_count}件")
        if requests_count > 0:
            parts.append(f"あなたへの依頼 {requests_count}件")

        if not parts:
            return "現在対応が必要な急ぎのタスクや依頼はありません。"
        return " ・ ".join(parts)


@dataclass(frozen=True)
class HomeAlert:
    """ホーム画面に表示するおすすめ・お知らせカードを表すデータクラス。"""

    alert_type: str  # "inbox" | "checkin" | "alerts"
    icon: str
    title_key: str
    desc_key: str
    target_page: str
    count: int = 0


def get_home_alerts(
    member_id: str,
    tasks: Iterable[Task],
    checkins: Iterable[Checkin],
    today: date,
    dismissed_types: set[str] | None = None,
) -> list[HomeAlert]:
    """ホーム画面に表示するお知らせカードのリストを優先度順に返す（お知らせがない場合は空リスト）。"""
    dismissed = dismissed_types or set()
    alerts: list[HomeAlert] = []

    # 1. 依頼が届いている（未返答の依頼）
    if "inbox" not in dismissed:
        inbox_count = sum(
            1
            for t in tasks
            if t.owner_member_id == member_id
            and not t.archived
            and t.assignment_status in ("依頼中", "相談中")
            and t.requested_by != member_id
        )
        if inbox_count > 0:
            alerts.append(
                HomeAlert(
                    alert_type="inbox",
                    icon=":material/inbox:",
                    title_key="home.alert_inbox_title",
                    desc_key="home.alert_inbox_desc",
                    target_page="app_pages/inbox.py",
                    count=inbox_count,
                )
            )

    # 2. 今日の体感負荷が未回答
    if "checkin" not in dismissed:
        has_today_checkin = any(
            c.member_id == member_id and c.date == today for c in checkins
        )
        if not has_today_checkin:
            alerts.append(
                HomeAlert(
                    alert_type="checkin",
                    icon=":material/mood:",
                    title_key="home.alert_checkin_title",
                    desc_key="home.alert_checkin_desc",
                    target_page="app_pages/checkin.py",
                )
            )

    # 3. 期限を過ぎた NA がある
    if "alerts" not in dismissed:
        overdue_count = sum(
            1
            for t in tasks
            if t.owner_member_id == member_id
            and not t.archived
            and t.status != "完了"
            and t.na_due < today
        )
        if overdue_count > 0:
            alerts.append(
                HomeAlert(
                    alert_type="alerts",
                    icon=":material/alarm:",
                    title_key="home.alert_overdue_title",
                    desc_key="home.alert_overdue_desc",
                    target_page="app_pages/my_tasks.py",
                    count=overdue_count,
                )
            )

    return alerts


