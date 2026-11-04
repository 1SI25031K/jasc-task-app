"""Notifier インターフェース・ダミー実装、および各種通知文（F12 毎朝まとめ・F18 個人DM・F19 週次完了まとめ）の組み立て。"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any, Callable, Iterable

from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError

from core.models import LangCode, Member, Role, Task
from core.reminders import MemberDailyDigest, ReminderItem
from core.services import is_due_this_week, is_overdue_na


def escape_slack_text(text: str) -> str:
    """Slack メッセージ内で特別な意味を持つ `&`, `<`, `>` をエスケープする（S6）。"""
    if not text:
        return ""
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _build_page_url(app_url: str, page_slug: str = "") -> str:
    """アプリのベースURLとページスラッグからリンク用URLを組み立てる。"""
    base = app_url.strip().rstrip("/")
    if not base:
        base = "https://jasc79-tasks.example.com"
    if not page_slug:
        return base
    return f"{base}/{page_slug.lstrip('/')}"


# ==============================================================================
# F12：毎朝のまとめ投稿の文面組み立て（日本語・英語）
# ==============================================================================


def format_morning_summary(
    today: date,
    tasks: Iterable[Task],
    members: Iterable[Member],
    roles: Iterable[Role],
    app_url: str = "",
    lang: LangCode = "ja",
    missing_slack_id_count: int | None = None,
) -> str:
    """F12 毎朝のまとめ投稿の文面（期限を過ぎたNA・今日期限のNA・件数・リンク・Slack未設定人数）を組み立てる。

    - 責める表現（「遅れ」「未達成」など）を避け、「期限を過ぎた NA」「今日が期限の NA」と中立的に表現する（6.3）。
    - 0件の日は短い一文だけにする（F12）。
    - slack_user_id が空の active メンバーがいる場合は末尾に「Slack ID 未設定：○名」を付記する（5.6）。
    """
    member_list = list(members)
    member_map = {m.member_id: m for m in member_list}
    role_map = {r.role_id: r for r in roles}

    if missing_slack_id_count is None:
        missing_slack_id_count = sum(
            1 for m in member_list if m.active and not m.slack_user_id.strip()
        )

    active_tasks = [t for t in tasks if not t.archived and t.status != "完了"]
    overdue_tasks = sorted(
        (t for t in active_tasks if is_overdue_na(t, today)),
        key=lambda t: (t.na_due, t.task_id),
    )
    due_today_tasks = sorted(
        (t for t in active_tasks if t.na_due == today),
        key=lambda t: t.task_id,
    )

    board_url = _build_page_url(app_url, "")
    alerts_url = _build_page_url(app_url, "alerts")

    def _owner_label(owner_id: str) -> str:
        m = member_map.get(owner_id)
        return escape_slack_text(m.get_name(lang)) if m else owner_id

    def _roles_label(r_ids: list[str]) -> str:
        names = [
            escape_slack_text(role_map[rid].get_name(lang))
            for rid in r_ids
            if rid in role_map
        ]
        return " / ".join(names) if names else "-"

    lines: list[str] = []

    if lang == "en":
        if not overdue_tasks and not due_today_tasks:
            lines.append(
                f"Good morning! ({today.isoformat()}) There are no NAs due today or past their due date. Have a great day! ({board_url})"
            )
        else:
            lines.append(f"*[JASC79 Daily NA Summary — {today.isoformat()}]*")
            lines.append(
                f"Summary: Past due NAs: *{len(overdue_tasks)}* | Due today: *{len(due_today_tasks)}* | Open tasks: *{len(active_tasks)}*"
            )
            if overdue_tasks:
                lines.append("\n*■ NAs Past Due Date*")
                for t in overdue_tasks:
                    title = escape_slack_text(t.title)
                    na = escape_slack_text(t.next_action)
                    lines.append(
                        f"• [{_roles_label(t.role_ids)}] *{title}* — NA: {na} (Due: {t.na_due.isoformat()} / Owner: {_owner_label(t.owner_member_id)})"
                    )
            if due_today_tasks:
                lines.append("\n*■ NAs Due Today*")
                for t in due_today_tasks:
                    title = escape_slack_text(t.title)
                    na = escape_slack_text(t.next_action)
                    lines.append(
                        f"• [{_roles_label(t.role_ids)}] *{title}* — NA: {na} (Owner: {_owner_label(t.owner_member_id)})"
                    )
            lines.append(
                f"\n👉 Check details and update NAs here: {alerts_url}"
            )

        if missing_slack_id_count > 0:
            lines.append(f"\n(Admin note) Slack ID not set: {missing_slack_id_count} member(s)")
    else:
        if not overdue_tasks and not due_today_tasks:
            lines.append(
                f"おはようございます！（{today.isoformat()}）本日が期限の NA や、期限を過ぎた NA はありません。今日もよろしくお願いします！（{board_url}）"
            )
        else:
            lines.append(f"*【JASC79 毎朝の NA まとめ（{today.isoformat()}）】*")
            lines.append(
                f"件数サマリー：期限を過ぎた NA *{len(overdue_tasks)}件* ／ 今日が期限の NA *{len(due_today_tasks)}件* ／ 未完了タスク全体 *{len(active_tasks)}件*"
            )
            if overdue_tasks:
                lines.append("\n*■ 期限を過ぎた NA（日程の再調整や更新をお願いします）*")
                for t in overdue_tasks:
                    title = escape_slack_text(t.title)
                    na = escape_slack_text(t.next_action)
                    lines.append(
                        f"・[{_roles_label(t.role_ids)}] *{title}* — NA：{na}（期限：{t.na_due.isoformat()} ／ 担当：{_owner_label(t.owner_member_id)}）"
                    )
            if due_today_tasks:
                lines.append("\n*■ 今日が期限の NA*")
                for t in due_today_tasks:
                    title = escape_slack_text(t.title)
                    na = escape_slack_text(t.next_action)
                    lines.append(
                        f"・[{_roles_label(t.role_ids)}] *{title}* — NA：{na}（担当：{_owner_label(t.owner_member_id)}）"
                    )
            lines.append(
                f"\n👉 アプリでの確認・NAの更新はこちら：{alerts_url}"
            )

        if missing_slack_id_count > 0:
            lines.append(f"\n※Slack ID 未設定：{missing_slack_id_count}名")

    return "\n".join(lines)


# ==============================================================================
# F18：個人 DM リマインド（1人1通）の文面組み立て（日本語・英語）
# ==============================================================================


def format_personal_dm(
    digest: MemberDailyDigest,
    app_url: str = "",
    lang: LangCode | None = None,
) -> str:
    """F18 1人分の MemberDailyDigest から、その人の言語に合わせた1通の DM 文面を組み立てる（5.6・6.3）。"""
    member = digest.member
    target_lang: LangCode = lang or member.lang
    member_name = escape_slack_text(member.get_name(target_lang))

    by_kind: dict[str, list[ReminderItem]] = {}
    for item in digest.items:
        by_kind.setdefault(item.kind, []).append(item)

    my_tasks_url = _build_page_url(app_url, "my_tasks")
    inbox_url = _build_page_url(app_url, "inbox")
    checkin_url = _build_page_url(app_url, "checkin")
    capacity_url = _build_page_url(app_url, "capacity_map")
    alerts_url = _build_page_url(app_url, "alerts")

    def _fmt_task(t: Task | None) -> str:
        if t is None:
            return ""
        title = escape_slack_text(t.title)
        na = escape_slack_text(t.next_action)
        return f"*{title}* — NA: {na} ({t.na_due.isoformat()})"

    lines: list[str] = []

    if target_lang == "en":
        lines.append(
            f"Good morning, {member_name}! Here is your daily task & NA update ({digest.logs_to_record[0].date_key if digest.logs_to_record else ''})."
        )

        if "high_load_alert" in by_kind:
            for item in by_kind["high_load_alert"]:
                if (
                    item.target_member is None
                    or item.target_member.member_id == member.member_id
                ):
                    lines.append(
                        f"\n*■ Note on Workload*\nYour recent workload check-ins have been high. Please don't hesitate to consult the team and adjust task assignments.\n👉 Capacity Map: {capacity_url}"
                    )
                else:
                    target_name = escape_slack_text(
                        item.target_member.get_name("en")
                    )
                    lines.append(
                        f"\n*■ Team Workload Notice (For Chair / Vice Chair)*\n{target_name} has reported a high workload score in consecutive check-ins. Let's review the balance together.\n👉 Capacity Map: {capacity_url}"
                    )

        if "checkin" in by_kind:
            lines.append(
                f"\n*■ Quick Workload Check-in*\nHow is your current capacity (1–10)? You can answer with just one tap.\n👉 Check-in Page: {checkin_url}"
            )

        if "request_new" in by_kind:
            lines.append(
                f"\n*■ New Task Requests for You*\n👉 Request Inbox: {inbox_url}"
            )
            for item in by_kind["request_new"]:
                req_from = (
                    escape_slack_text(item.target_member.get_name("en"))
                    if item.target_member
                    else "a team member"
                )
                lines.append(
                    f"• You have a request from {req_from}: {_fmt_task(item.task)}"
                )

        if "request_accepted" in by_kind:
            lines.append(
                f"\n*■ Updates on Tasks You Requested (Accepted)*\n👉 My Tasks: {my_tasks_url}"
            )
            for item in by_kind["request_accepted"]:
                owner_name = (
                    escape_slack_text(item.target_member.get_name("en"))
                    if item.target_member
                    else "the owner"
                )
                lines.append(
                    f"• {owner_name} accepted your request: {_fmt_task(item.task)}"
                )

        if "request_consulted" in by_kind:
            lines.append(
                f"\n*■ Updates on Tasks You Requested (Discussion Requested)*\n👉 Request Inbox: {inbox_url}"
            )
            for item in by_kind["request_consulted"]:
                owner_name = (
                    escape_slack_text(item.target_member.get_name("en"))
                    if item.target_member
                    else "the owner"
                )
                cmt = (
                    escape_slack_text(item.task.assignment_comment)
                    if item.task and item.task.assignment_comment
                    else ""
                )
                lines.append(
                    f"• {owner_name} would like to discuss: {_fmt_task(item.task)} — Comment: \"{cmt}\""
                )

        if "request_pending" in by_kind:
            lines.append(
                f"\n*■ Task Requests Waiting for Your Response*\nPlease review and choose 'Accept' or 'Discuss' when you have a moment:\n👉 Request Inbox: {inbox_url}"
            )
            for item in by_kind["request_pending"]:
                lines.append(f"• {_fmt_task(item.task)}")

        if "due_today" in by_kind:
            lines.append(f"\n*■ NAs Due Today*\n👉 My Tasks: {my_tasks_url}")
            for item in by_kind["due_today"]:
                lines.append(f"• {_fmt_task(item.task)}")

        if "due_tomorrow" in by_kind:
            lines.append(f"\n*■ NAs Due Tomorrow*\n👉 My Tasks: {my_tasks_url}")
            for item in by_kind["due_tomorrow"]:
                lines.append(f"• {_fmt_task(item.task)}")

        if "overdue" in by_kind:
            lines.append(
                f"\n*■ NAs Past Due Date (Feel free to update the next step or due date)*\n👉 My Tasks: {my_tasks_url}"
            )
            for item in by_kind["overdue"]:
                lines.append(f"• {_fmt_task(item.task)}")

        if "overdue_escalation" in by_kind:
            lines.append(
                f"\n*■ Role Lead Notice: NAs Past Due in Your Role*\nLet's check if any support or rescheduling is helpful:\n👉 Alerts Page: {alerts_url}"
            )
            for item in by_kind["overdue_escalation"]:
                owner_name = (
                    escape_slack_text(item.target_member.get_name("en"))
                    if item.target_member
                    else ""
                )
                lines.append(
                    f"• {_fmt_task(item.task)} (Owner: {owner_name})"
                )

        if "waiting" in by_kind:
            lines.append(
                f"\n*■ Tasks Waiting for Your Confirmation / Input*\n👉 All Tasks / Alerts: {alerts_url}"
            )
            for item in by_kind["waiting"]:
                owner_name = (
                    escape_slack_text(item.target_member.get_name("en"))
                    if item.target_member
                    else ""
                )
                lines.append(
                    f"• {_fmt_task(item.task)} (Owner: {owner_name})"
                )

        if "stale" in by_kind:
            lines.append(
                f"\n*■ Weekly Status Check (Tasks with no updates for 7+ days)*\nIf there is any update or if you'd like to adjust the plan, please update here:\n👉 My Tasks: {my_tasks_url}"
            )
            for item in by_kind["stale"]:
                lines.append(f"• {_fmt_task(item.task)}")
    else:
        lines.append(
            f"{member_name}さん、おはようございます！本日のタスク・NAのご案内です。"
        )

        if "high_load_alert" in by_kind:
            for item in by_kind["high_load_alert"]:
                if (
                    item.target_member is None
                    or item.target_member.member_id == member.member_id
                ):
                    lines.append(
                        f"\n*■ 体感負荷に関するご案内*\n直近のチェックインで負荷が高めの状態が続いています。無理せず、分担の調整や期限の変更をご相談ください。\n👉 余力マップを見る：{capacity_url}"
                    )
                else:
                    target_name = escape_slack_text(
                        item.target_member.get_name("ja")
                    )
                    lines.append(
                        f"\n*■ 体感負荷のお知らせ（委員長・副委員長向け）*\n{target_name}さんの体感負荷が高めの状態が続いています。分担の調整など、サポートできることがないか確認をお願いします。\n👉 余力マップを見る：{capacity_url}"
                    )

        if "checkin" in by_kind:
            lines.append(
                f"\n*■ 体感負荷チェックインのご案内*\n現在の余裕度（1〜10）をボタン1つで回答できます。分担を話し合う材料としてご協力をお願いします。\n👉 体感負荷チェックイン：{checkin_url}"
            )

        if "request_new" in by_kind:
            lines.append(
                f"\n*■ 新しい依頼が届いています*\n👉 依頼の受信箱：{inbox_url}"
            )
            for item in by_kind["request_new"]:
                req_from = (
                    escape_slack_text(item.target_member.get_name("ja"))
                    if item.target_member
                    else "メンバー"
                )
                lines.append(
                    f"・{req_from}さんから依頼が届いています：{_fmt_task(item.task)}"
                )

        if "request_accepted" in by_kind:
            lines.append(
                f"\n*■ 依頼したタスクが承諾されました*\n👉 マイタスク：{my_tasks_url}"
            )
            for item in by_kind["request_accepted"]:
                owner_name = (
                    escape_slack_text(item.target_member.get_name("ja"))
                    if item.target_member
                    else "担当者"
                )
                lines.append(
                    f"・{owner_name}さんが依頼を承諾しました：{_fmt_task(item.task)}"
                )

        if "request_consulted" in by_kind:
            lines.append(
                f"\n*■ 依頼したタスクについて相談コメントが届いています*\n👉 依頼の受信箱：{inbox_url}"
            )
            for item in by_kind["request_consulted"]:
                owner_name = (
                    escape_slack_text(item.target_member.get_name("ja"))
                    if item.target_member
                    else "担当者"
                )
                cmt = (
                    escape_slack_text(item.task.assignment_comment)
                    if item.task and item.task.assignment_comment
                    else ""
                )
                lines.append(
                    f"・{owner_name}さんから相談コメント：「{cmt}」 — {_fmt_task(item.task)}"
                )

        if "request_pending" in by_kind:
            lines.append(
                f"\n*■ お返事待ちの依頼があります*\n内容を確認し、「承諾」または「相談したい」から状況をお知らせください。\n👉 依頼の受信箱：{inbox_url}"
            )
            for item in by_kind["request_pending"]:
                lines.append(f"・{_fmt_task(item.task)}")

        if "due_today" in by_kind:
            lines.append(f"\n*■ 今日が期限の NA*\n👉 マイタスク：{my_tasks_url}")
            for item in by_kind["due_today"]:
                lines.append(f"・{_fmt_task(item.task)}")

        if "due_tomorrow" in by_kind:
            lines.append(f"\n*■ 明日が期限の NA*\n👉 マイタスク：{my_tasks_url}")
            for item in by_kind["due_tomorrow"]:
                lines.append(f"・{_fmt_task(item.task)}")

        if "overdue" in by_kind:
            lines.append(
                f"\n*■ 期限を過ぎた NA（予定の再調整やNAの更新をお願いします）*\n👉 マイタスク：{my_tasks_url}"
            )
            for item in by_kind["overdue"]:
                lines.append(f"・{_fmt_task(item.task)}")

        if "overdue_escalation" in by_kind:
            lines.append(
                f"\n*■ 担当役職での期限超過のお知らせ（責任者向け）*\n期限を過ぎている NA があります。分担やスケジュール調整のフォローをお願いします。\n👉 期限アラート画面：{alerts_url}"
            )
            for item in by_kind["overdue_escalation"]:
                owner_name = (
                    escape_slack_text(item.target_member.get_name("ja"))
                    if item.target_member
                    else ""
                )
                lines.append(
                    f"・{_fmt_task(item.task)}（担当：{owner_name}）"
                )

        if "waiting" in by_kind:
            lines.append(
                f"\n*■ あなたの確認・返答を待っているタスク*\n👉 期限アラート・全タスク一覧：{alerts_url}"
            )
            for item in by_kind["waiting"]:
                owner_name = (
                    escape_slack_text(item.target_member.get_name("ja"))
                    if item.target_member
                    else ""
                )
                lines.append(
                    f"・{_fmt_task(item.task)}（担当：{owner_name}）"
                )

        if "stale" in by_kind:
            lines.append(
                f"\n*■ 進捗の確認（1週間以上更新のないタスク）*\n状況の変化や困っていることがあれば、NAやメモの更新をお願いします。\n👉 マイタスク：{my_tasks_url}"
            )
            for item in by_kind["stale"]:
                lines.append(f"・{_fmt_task(item.task)}")

    return "\n".join(lines)


# ==============================================================================
# F19：週次の完了まとめ（毎週月曜の朝）の文面組み立て（日本語・英語）
# ==============================================================================


def format_weekly_completed_summary(
    today: date,
    tasks: Iterable[Task],
    members: Iterable[Member],
    roles: Iterable[Role],
    app_url: str = "",
    lang: LangCode = "ja",
) -> str:
    """F19 毎週月曜の朝に投稿する「先週完了したタスク」と「今週期限の主なNA」のまとめ文面を組み立てる。

    重要ルール（F19）：
    - 完了0件の役職は載せない（責める形にしない）。
    - 先週完了したタスクを役職ごと・担当者名付きで表示し、貢献を見えるようにする（1.・5.2）。
    """
    member_map = {m.member_id: m for m in members}
    active_roles = sorted(
        (r for r in roles if r.active), key=lambda r: r.sort_order
    )
    active_tasks = [t for t in tasks if not t.archived]

    week_ago = today - timedelta(days=7)

    def _is_completed_last_week(t: Task) -> bool:
        if t.status != "完了":
            return False
        if t.completed_at is not None:
            comp_date = t.completed_at.date()
            return week_ago <= comp_date <= today
        return week_ago <= t.updated_at.date() <= today

    completed_last_week = [
        t for t in active_tasks if _is_completed_last_week(t)
    ]
    due_this_week = sorted(
        (t for t in active_tasks if is_due_this_week(t, today)),
        key=lambda t: (t.na_due, t.task_id),
    )

    def _owner_label(owner_id: str) -> str:
        m = member_map.get(owner_id)
        return escape_slack_text(m.get_name(lang)) if m else owner_id

    progress_url = _build_page_url(app_url, "progress")

    lines: list[str] = []

    if lang == "en":
        lines.append(
            f"*[JASC79 Weekly Completed Tasks Summary ({week_ago.isoformat()} – {today.isoformat()})]*"
        )
        lines.append(
            f"Thank you all for your hard work last week! Total completed tasks last week: *{len(completed_last_week)}*"
        )

        if completed_last_week:
            lines.append("\n*■ Completed Tasks by Role*")
            for role in active_roles:
                role_done = [
                    t
                    for t in completed_last_week
                    if role.role_id in t.role_ids
                ]
                # 完了0件の役職は載せない（F19）
                if not role_done:
                    continue
                role_name = escape_slack_text(role.get_name("en"))
                lines.append(f"*{role_name} ({len(role_done)})*")
                for t in role_done:
                    title = escape_slack_text(t.title)
                    lines.append(
                        f"  • {title} (Owner: {_owner_label(t.owner_member_id)})"
                    )
        else:
            lines.append(
                "\nLet's keep supporting each other on our ongoing tasks this week!"
            )

        if due_this_week:
            lines.append(
                f"\n*■ Key NAs Due This Week ({len(due_this_week)} total)*"
            )
            for t in due_this_week[:10]:
                title = escape_slack_text(t.title)
                na = escape_slack_text(t.next_action)
                lines.append(
                    f"• *{title}* — NA: {na} (Due: {t.na_due.isoformat()} / Owner: {_owner_label(t.owner_member_id)})"
                )

        lines.append(f"\n👉 View Progress Charts: {progress_url}")
    else:
        lines.append(
            f"*【JASC79 週次まとめ：先週の完了タスク（{week_ago.isoformat()} 〜 {today.isoformat()}）】*"
        )
        lines.append(
            f"先週も1週間お疲れさまでした！先週完了したタスクは全体で *{len(completed_last_week)}件* です。"
        )

        if completed_last_week:
            lines.append("\n*■ 役職別の完了タスク*")
            for role in active_roles:
                role_done = [
                    t
                    for t in completed_last_week
                    if role.role_id in t.role_ids
                ]
                # 完了0件の役職は載せない（F19）
                if not role_done:
                    continue
                role_name = escape_slack_text(role.get_name("ja"))
                lines.append(f"*{role_name}（{len(role_done)}件）*")
                for t in role_done:
                    title = escape_slack_text(t.title)
                    lines.append(
                        f"  ・{title}（担当：{_owner_label(t.owner_member_id)}）"
                    )
        else:
            lines.append(
                "\n今週もそれぞれのペースで進めていきましょう！"
            )

        if due_this_week:
            lines.append(
                f"\n*■ 今週が期限の主な NA（全{len(due_this_week)}件）*"
            )
            for t in due_this_week[:10]:
                title = escape_slack_text(t.title)
                na = escape_slack_text(t.next_action)
                lines.append(
                    f"・*{title}* — NA：{na}（期限：{t.na_due.isoformat()} ／ 担当：{_owner_label(t.owner_member_id)}）"
                )

        lines.append(f"\n👉 進捗グラフを見る：{progress_url}")

    return "\n".join(lines)


# ==============================================================================
# Notifier インターフェースとダミー実装
# ==============================================================================


@dataclass
class SentMessage:
    """DummyNotifier が記録する送信メッセージ1件。"""

    target_id: str  # channel_id または slack_user_id
    text: str


class Notifier(ABC):
    """Slack 等の通知サービスの抽象インターフェース（3. 設計方針）。"""

    @abstractmethod
    def send_channel_message(self, channel_id: str, text: str) -> None:
        """指定チャンネルにメッセージを投稿する。"""

    @abstractmethod
    def send_dm(self, slack_user_id: str, text: str) -> None:
        """指定ユーザーの個人 DM にメッセージを送信する。"""


class DummyNotifier(Notifier):
    """テストおよびローカル開発用のダミー Notifier 実装（外部通信を行わない）。"""

    def __init__(self) -> None:
        """送信履歴リストを初期化する。"""
        self.sent_channel_messages: list[SentMessage] = []
        self.sent_dms: list[SentMessage] = []

    def send_channel_message(self, channel_id: str, text: str) -> None:
        """チャンネルメッセージをメモリに記録する。"""
        self.sent_channel_messages.append(
            SentMessage(target_id=channel_id, text=text)
        )

    def send_dm(self, slack_user_id: str, text: str) -> None:
        """個人 DM をメモリに記録する。"""
        self.sent_dms.append(
            SentMessage(target_id=slack_user_id, text=text)
        )


def _execute_with_single_retry(operation: Callable[[], Any]) -> Any:
    """指定された送信関数を実行し、例外が発生した場合は1回だけ再試行する（フェーズ5要件3）。"""
    try:
        return operation()
    except Exception:
        return operation()


class SlackNotifier(Notifier):
    """slack_sdk の WebClient を使ってチャンネル投稿・個人 DM を送信する実装（3. 技術構成・S14）。

    - 最小限の権限（`chat:write`, `im:write`）で動作する。
    - 送信失敗時は1回だけ再試行し、2回目も失敗した場合は例外を送出する。
    """

    def __init__(
        self, bot_token: str = "", client: WebClient | Any | None = None
    ) -> None:
        """Bot トークンまたは既存の WebClient インスタンスから初期化する。"""
        if client is not None:
            self._client = client
        else:
            token = bot_token.strip()
            if not token:
                raise ValueError("Slack Bot トークンが空です。")
            self._client = WebClient(token=token)

    def send_channel_message(self, channel_id: str, text: str) -> None:
        """指定チャンネル（channel_id）にメッセージを投稿する。失敗時は1回再試行する。"""
        cid = channel_id.strip()
        if not cid:
            raise ValueError("channel_id が空です。")

        def _post() -> None:
            self._client.chat_postMessage(channel=cid, text=text)

        _execute_with_single_retry(_post)

    def send_dm(self, slack_user_id: str, text: str) -> None:
        """conversations_open で 1対1 DM チャンネルを開き、メッセージを送信する。失敗時は1回再試行する。"""
        uid = slack_user_id.strip()
        if not uid:
            raise ValueError("slack_user_id が空です。")

        def _open_and_post() -> None:
            open_resp = self._client.conversations_open(users=[uid])
            channel_obj = open_resp.get("channel") if isinstance(open_resp, dict) or hasattr(open_resp, "get") else None
            dm_channel_id = (
                channel_obj.get("id")
                if channel_obj and hasattr(channel_obj, "get")
                else uid
            )
            self._client.chat_postMessage(channel=dm_channel_id, text=text)

        _execute_with_single_retry(_open_and_post)


