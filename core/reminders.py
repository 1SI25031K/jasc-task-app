"""5.6 個人 DM リマインド対象の抽出と、1人1通（MemberDailyDigest）へのまとめロジック。"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Iterable

from core.load import check_high_load_alert
from core.models import (
    ActivityLog,
    Checkin,
    Member,
    ReminderKind,
    ReminderLog,
    RoleAssignment,
    Task,
)
from core.services import is_overdue_na, is_stale_task
from core.settings import AppSettings

WEEKDAY_JA_MAP: dict[int, str] = {
    0: "月",
    1: "火",
    2: "水",
    3: "木",
    4: "金",
    5: "土",
    6: "日",
}


@dataclass
class ReminderItem:
    """個人 DM に含める個別のリマインド項目。"""

    member_id: str
    kind: ReminderKind
    task_id: str = ""
    task: Task | None = None
    target_member: Member | None = None  # high_load_alert で委員長に知らせる際の対象メンバー等


@dataclass
class MemberDailyDigest:
    """1人のメンバーに対してその日に送る1通分の DM リマインド内容（5.6）。"""

    member: Member
    items: list[ReminderItem] = field(default_factory=list)
    logs_to_record: list[ReminderLog] = field(default_factory=list)


@dataclass
class DailyReminderPlan:
    """その日の全メンバー分の DM 送信計画と、Slack ID 未設定メンバーの一覧。"""

    date_key: str
    digests: list[MemberDailyDigest] = field(default_factory=list)
    skipped_no_slack_id_members: list[Member] = field(default_factory=list)


def get_japanese_weekday(target_date: date) -> str:
    """date から日本語の曜日1文字（'月'〜'日'）を返す。"""
    return WEEKDAY_JA_MAP[target_date.weekday()]


def _build_role_leaders_map(
    role_assignments: Iterable[RoleAssignment],
    active_member_ids: set[str],
) -> dict[str, list[str]]:
    """role_id -> 責任者の member_id リスト の辞書を構築する。"""
    leaders: dict[str, list[str]] = {}
    for ra in role_assignments:
        if ra.kind == "責任者" and ra.member_id in active_member_ids:
            leaders.setdefault(ra.role_id, [])
            if ra.member_id not in leaders[ra.role_id]:
                leaders[ra.role_id].append(ra.member_id)
    return leaders


def build_daily_reminder_plan(
    now: datetime,
    members: Iterable[Member],
    tasks: Iterable[Task],
    checkins: Iterable[Checkin],
    role_assignments: Iterable[RoleAssignment],
    reminder_logs: Iterable[ReminderLog],
    settings: AppSettings | None = None,
    activity_logs: Iterable[ActivityLog] | None = None,
) -> DailyReminderPlan:
    """5.6 のルールに従い、その日に送信する個人 DM リマインドを抽出して1人1通にまとめる。

    実装ルール：
    - 同じ (member_id, kind, task_id, date_key) がすでに reminder_logs にあれば除外（二重送信防止 4.9）。
    - overdue_escalation（責任者への通知）は、過去の全日付を通じて同じ (member_id, 'overdue_escalation', task_id) が
      一度でも送信されていれば除外（1タスクにつき最初の1回のみ 5.6）。
    - waiting（待ちの相手）は 2日に1回（前日 yesterday_key に送信されていればスキップ 5.6）。
    - stale（停滞）は週1回・月曜のみ（5.6）。
    - checkin（体感負荷の入力）は checkin_weekdays の曜日で、その日まだ回答していない人のみ（5.6）。
    - reminders_enabled=False の人には high_load_alert 以外の DM を送らない（5.6）。
    - slack_user_id が空の人は送信をスキップし、skipped_no_slack_id_members に記録する（5.6）。
    """
    cfg = settings or AppSettings()
    today = now.date()
    date_key = today.isoformat()
    yesterday_key = (today - timedelta(days=1)).isoformat()
    weekday_ja = get_japanese_weekday(today)

    active_members = [m for m in members if m.active]
    member_map: dict[str, Member] = {m.member_id: m for m in active_members}
    active_member_ids = set(member_map.keys())

    task_list = [t for t in tasks if not t.archived and t.status != "完了"]
    checkin_list = list(checkins)
    ra_list = list(role_assignments)
    log_list = list(reminder_logs)

    # 送信済み判定セット
    sent_today: set[tuple[str, str, str, str]] = {
        (log.member_id, log.kind, log.task_id, log.date_key)
        for log in log_list
        if log.date_key == date_key
    }
    sent_yesterday_waiting: set[tuple[str, str]] = {
        (log.member_id, log.task_id)
        for log in log_list
        if log.date_key == yesterday_key and log.kind == "waiting"
    }
    sent_ever_escalation: set[tuple[str, str]] = {
        (log.member_id, log.task_id)
        for log in log_list
        if log.kind == "overdue_escalation"
    }

    role_leaders = _build_role_leaders_map(ra_list, active_member_ids)

    raw_items_by_member: dict[str, list[ReminderItem]] = {
        m.member_id: [] for m in active_members
    }

    def add_candidate(item: ReminderItem) -> None:
        """送信条件（active, reminders_enabled, 重複防止）を満たす場合のみ候補に追加する。"""
        m = member_map.get(item.member_id)
        if m is None:
            return
        # reminders_enabled=False の人には high_load_alert 以外の DM を送らない
        if not m.reminders_enabled and item.kind != "high_load_alert":
            return
        # 当日の二重送信防止（4.9）
        key = (item.member_id, item.kind, item.task_id, date_key)
        if key in sent_today:
            return
        # 同じバッチ内で同一キーが重複追加されないようにマーク
        sent_today.add(key)
        raw_items_by_member[item.member_id].append(item)

    # ------------------------------------------------------------------
    # 1〜7. タスクに紐づくリマインドの抽出
    # ------------------------------------------------------------------
    tomorrow = today + timedelta(days=1)

    for task in task_list:
        owner_id = task.owner_member_id

        # ① 明日期限 (na_due == 明日)
        if task.na_due == tomorrow:
            add_candidate(
                ReminderItem(
                    member_id=owner_id,
                    kind="due_tomorrow",
                    task_id=task.task_id,
                    task=task,
                )
            )

        # ② 今日期限 (na_due == 今日)
        if task.na_due == today:
            add_candidate(
                ReminderItem(
                    member_id=owner_id,
                    kind="due_today",
                    task_id=task.task_id,
                    task=task,
                )
            )

        # ③ 期限切れ (na_due < 今日：毎朝)
        if is_overdue_na(task, today):
            add_candidate(
                ReminderItem(
                    member_id=owner_id,
                    kind="overdue",
                    task_id=task.task_id,
                    task=task,
                )
            )

            # ④ 期限切れ（責任者へ）：超過が overdue_escalation_days 日以上、1タスクにつき最初の1回のみ
            overdue_days = (today - task.na_due).days
            if overdue_days >= cfg.overdue_escalation_days:
                notified_leaders: set[str] = set()
                for r_id in task.role_ids:
                    for leader_id in role_leaders.get(r_id, []):
                        # 担当者本人を除く
                        if leader_id == owner_id or leader_id in notified_leaders:
                            continue
                        notified_leaders.add(leader_id)
                        if (leader_id, task.task_id) not in sent_ever_escalation:
                            add_candidate(
                                ReminderItem(
                                    member_id=leader_id,
                                    kind="overdue_escalation",
                                    task_id=task.task_id,
                                    task=task,
                                    target_member=member_map.get(owner_id),
                                )
                            )

        # ⑤ 待ちの相手：status=待ち かつ waiting_on_member_id がある（2日に1回：前日送っていなければ送る）
        if task.status == "待ち" and task.waiting_on_member_id:
            wait_target_id = task.waiting_on_member_id
            if (wait_target_id, task.task_id) not in sent_yesterday_waiting:
                add_candidate(
                    ReminderItem(
                        member_id=wait_target_id,
                        kind="waiting",
                        task_id=task.task_id,
                        task=task,
                        target_member=member_map.get(owner_id),
                    )
                )

        # ⑥ 停滞：停滞タスク（週1回、月曜）
        if weekday_ja == "月" and is_stale_task(task, now, cfg.stale_days):
            add_candidate(
                ReminderItem(
                    member_id=owner_id,
                    kind="stale",
                    task_id=task.task_id,
                    task=task,
                )
            )

        # ⑦ 依頼の返事待ち：依頼中が request_reminder_days 日以上
        if task.assignment_status == "依頼中":
            if (now - task.updated_at) >= timedelta(
                days=cfg.request_reminder_days
            ):
                add_candidate(
                    ReminderItem(
                        member_id=owner_id,
                        kind="request_pending",
                        task_id=task.task_id,
                        task=task,
                        target_member=member_map.get(task.requested_by),
                    )
                )
            elif (now - task.updated_at) <= timedelta(hours=24) and task.requested_by:
                # ⑦-b 新しい依頼（前回の定時処理以降＝直近24時間以内に発生した依頼中タスク）
                sent_new_req = any(
                    log.member_id == owner_id
                    and log.kind == "request_new"
                    and log.task_id == task.task_id
                    for log in log_list
                )
                if not sent_new_req:
                    add_candidate(
                        ReminderItem(
                            member_id=owner_id,
                            kind="request_new",
                            task_id=task.task_id,
                            task=task,
                            target_member=member_map.get(task.requested_by),
                        )
                    )

        # ⑦-c 依頼への返事（承諾・相談：直近24時間以内に発生した場合、依頼した人に知らせる）
        if activity_logs is not None and task.requested_by:
            for alog in activity_logs:
                if alog.task_id != task.task_id:
                    continue
                if (now - alog.timestamp) > timedelta(hours=24):
                    continue
                if alog.action == "accept" and task.assignment_status == "承諾済":
                    add_candidate(
                        ReminderItem(
                            member_id=task.requested_by,
                            kind="request_accepted",
                            task_id=task.task_id,
                            task=task,
                            target_member=member_map.get(owner_id),
                        )
                    )
                elif alog.action == "consult" and task.assignment_status == "相談中":
                    add_candidate(
                        ReminderItem(
                            member_id=task.requested_by,
                            kind="request_consulted",
                            task_id=task.task_id,
                            task=task,
                            target_member=member_map.get(owner_id),
                        )
                    )

    # ------------------------------------------------------------------
    # 8. 体感負荷の入力（checkin_weekdays の曜日で、その日まだ回答していない全員）
    # ------------------------------------------------------------------
    if weekday_ja in cfg.checkin_weekdays:
        answered_today_member_ids = {
            c.member_id for c in checkin_list if c.date == today
        }
        for m in active_members:
            if m.member_id not in answered_today_member_ids:
                add_candidate(
                    ReminderItem(
                        member_id=m.member_id,
                        kind="checkin",
                        task_id="",
                    )
                )

    # ------------------------------------------------------------------
    # 9. 体感負荷アラート（5.4 の条件：本人 + 委員長・副委員長）
    # ------------------------------------------------------------------
    for m in active_members:
        alert_res = check_high_load_alert(
            member_id=m.member_id,
            checkins=checkin_list,
            role_assignments=ra_list,
            settings=cfg,
        )
        if not alert_res.is_alert:
            continue

        # 本人への通知（task_id は空文字 4.9）
        add_candidate(
            ReminderItem(
                member_id=m.member_id,
                kind="high_load_alert",
                task_id="",
                target_member=m,
            )
        )
        # 委員長・副委員長への通知（本人を除く）
        for leader_id in alert_res.notify_leader_ids:
            if leader_id == m.member_id:
                continue
            # 4.9 では high_load_alert の task_id は空（または複数人アラート時の区別のため空文字を基本とする）
            add_candidate(
                ReminderItem(
                    member_id=leader_id,
                    kind="high_load_alert",
                    task_id="",
                    target_member=m,
                )
            )

    # ------------------------------------------------------------------
    # 10. Slack ID の有無で振り分け、1人1通の MemberDailyDigest を作る
    # ------------------------------------------------------------------
    skipped_members: list[Member] = [
        m for m in active_members if not m.slack_user_id.strip()
    ]
    skipped_ids = {m.member_id for m in skipped_members}

    digests: list[MemberDailyDigest] = []
    for m in active_members:
        if m.member_id in skipped_ids:
            # slack_user_id が空の人は送信をスキップ（reminder_log にも記録しない）
            continue
        items = raw_items_by_member.get(m.member_id, [])
        if not items:
            continue
        logs = [
            ReminderLog(
                sent_at=now,
                member_id=m.member_id,
                kind=item.kind,
                task_id=item.task_id,
                date_key=date_key,
            )
            for item in items
        ]
        digests.append(
            MemberDailyDigest(
                member=m,
                items=items,
                logs_to_record=logs,
            )
        )

    return DailyReminderPlan(
        date_key=date_key,
        digests=digests,
        skipped_no_slack_id_members=skipped_members,
    )

