"""毎朝の定時処理スクリプト（集計 → 毎朝まとめ F12 → 個人 DM F18 → 月曜は週次まとめ F19）。

使い方：
  # 送信せずに、集計件数と送信予定の通知文面を表示する（ドライラン）
  uv run python scripts/daily_job.py --dry-run

  # 実際にスプレッドシートを更新し、Slack に送信して reminder_log に記録する
  uv run python scripts/daily_job.py
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass, field
from datetime import date, datetime
import json
import os
from pathlib import Path
import sys
import tomllib
from typing import Any

# プロジェクトルートを sys.path に追加
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from core.models import JST, ReminderLog
from core.notifier import (
    DummyNotifier,
    Notifier,
    SlackNotifier,
    format_morning_summary,
    format_personal_dm,
    format_weekly_completed_summary,
)
from core.reminders import build_daily_reminder_plan
from core.repository import InMemoryRepository, Repository
from core.sheets_repository import SheetsRepository
from core.snapshots import build_daily_snapshots, generate_and_save_daily_snapshots

SYSTEM_CHANNEL_MEMBER_ID = "SYSTEM_CHANNEL"


@dataclass
class DailyJobResult:
    """日次処理1回分の実行結果サマリー。"""

    date_key: str
    dry_run: bool
    snapshot_count: int = 0
    morning_summary_sent: bool = False
    morning_summary_text: str = ""
    weekly_summary_sent: bool = False
    weekly_summary_text: str = ""
    sent_dm_member_ids: list[str] = field(default_factory=list)
    failed_dm_member_ids: list[str] = field(default_factory=list)
    planned_dms: list[tuple[str, str, str]] = field(default_factory=list)  # (member_id, slack_user_id, text)


def run_daily_job(
    repo: Repository,
    notifier: Notifier,
    now: datetime | None = None,
    dry_run: bool = False,
) -> DailyJobResult:
    """日次バッチ処理を順序どおりに実行する（フェーズ5要件4）。

    順序：
    1. シート（Repository）から最新データを読み込む
    2. daily_snapshots を生成・上書き保存する（--dry-run 時は保存しない）
    3. 毎朝のまとめ（F12）を summary_channel_id に投稿する（未送信の場合のみ）
    4. 個人 DM（F18）を1人1通ずつ送り、成功した人のみ直ちに reminder_log に記録する
    5. 月曜日の場合は週次の完了まとめ（F19）も summary_channel_id に投稿する（未送信の場合のみ）
    """
    current_now = now or datetime.now(JST)
    today = current_now.date()
    date_key = today.isoformat()

    # 1. データの読み込み
    members = repo.list_members(active_only=False)
    roles = repo.list_roles(active_only=False)
    role_assignments = repo.list_role_assignments()
    tasks = repo.list_tasks(include_archived=False)
    checkins = repo.list_checkins()
    reminder_logs = repo.list_reminder_logs()
    activity_logs = repo.list_activity_logs()
    settings = repo.get_settings()

    result = DailyJobResult(date_key=date_key, dry_run=dry_run)

    # 2. daily_snapshots の更新（4.8）
    if dry_run:
        snapshots = build_daily_snapshots(
            target_date=today,
            tasks=tasks,
            roles=roles,
            members=members,
            settings=settings,
        )
    else:
        snapshots = generate_and_save_daily_snapshots(
            repo=repo, target_date=today
        )
    result.snapshot_count = len(snapshots)

    # 当日すでに送信済みのチャンネル投稿を確認するセット
    sent_channel_keys: set[tuple[str, str, str]] = {
        (log.kind, log.task_id, log.date_key)
        for log in reminder_logs
        if log.member_id == SYSTEM_CHANNEL_MEMBER_ID and log.date_key == date_key
    }

    channel_id = settings.summary_channel_id.strip()

    # 3. 毎朝のまとめ投稿（F12）
    morning_text = format_morning_summary(
        today=today,
        tasks=tasks,
        members=members,
        roles=roles,
        app_url=settings.app_url,
        lang="ja",
    )
    result.morning_summary_text = morning_text

    if channel_id:
        morning_key = ("morning_summary", channel_id, date_key)
        if morning_key not in sent_channel_keys:
            if not dry_run:
                notifier.send_channel_message(channel_id, morning_text)
                repo.add_reminder_log(
                    ReminderLog(
                        sent_at=current_now,
                        member_id=SYSTEM_CHANNEL_MEMBER_ID,
                        kind="morning_summary",
                        task_id=channel_id,
                        date_key=date_key,
                    )
                )
                result.morning_summary_sent = True

    # 4. 個人 DM リマインド（F18：1人1通）
    plan = build_daily_reminder_plan(
        now=current_now,
        members=members,
        tasks=tasks,
        checkins=checkins,
        role_assignments=role_assignments,
        reminder_logs=reminder_logs,
        settings=settings,
        activity_logs=activity_logs,
    )

    for digest in plan.digests:
        dm_text = format_personal_dm(
            digest=digest,
            app_url=settings.app_url,
            lang=digest.member.lang,
        )
        result.planned_dms.append(
            (digest.member.member_id, digest.member.slack_user_id, dm_text)
        )
        if dry_run:
            continue

        try:
            notifier.send_dm(digest.member.slack_user_id, dm_text)
            # 送信に成功した人のみ直ちに reminder_log に記録する（途中失敗時の二重送信防止）
            for log_entry in digest.logs_to_record:
                repo.add_reminder_log(log_entry)
            result.sent_dm_member_ids.append(digest.member.member_id)
        except Exception as exc:
            print(
                f"⚠️ メンバー {digest.member.member_id} への DM 送信に失敗しました: {type(exc).__name__}",
                file=sys.stderr,
            )
            result.failed_dm_member_ids.append(digest.member.member_id)

    # 5. 月曜日の場合は週次の完了まとめ（F19）も投稿
    if today.weekday() == 0:
        weekly_text = format_weekly_completed_summary(
            today=today,
            tasks=tasks,
            members=members,
            roles=roles,
            app_url=settings.app_url,
            lang="ja",
        )
        result.weekly_summary_text = weekly_text

        if channel_id:
            weekly_key = ("weekly_summary", channel_id, date_key)
            if weekly_key not in sent_channel_keys:
                if not dry_run:
                    notifier.send_channel_message(channel_id, weekly_text)
                    repo.add_reminder_log(
                        ReminderLog(
                            sent_at=current_now,
                            member_id=SYSTEM_CHANNEL_MEMBER_ID,
                            kind="weekly_summary",
                            task_id=channel_id,
                            date_key=date_key,
                        )
                    )
                    result.weekly_summary_sent = True

    if result.failed_dm_member_ids:
        raise RuntimeError(
            f"一部のメンバー（{', '.join(result.failed_dm_member_ids)}）への DM 送信に失敗しました（送信成功分は reminder_log に記録済みです）。"
        )

    return result


def _load_runtime_config() -> dict[str, Any]:
    """環境変数（GitHub Actions 用）または `.streamlit/secrets.toml` から設定を読み込む（秘密情報は表示しない）。"""
    cfg: dict[str, Any] = {}
    secrets_path = ROOT_DIR / ".streamlit" / "secrets.toml"
    if secrets_path.exists():
        with secrets_path.open("rb") as f:
            cfg.update(tomllib.load(f))

    if os.environ.get("SPREADSHEET_ID"):
        cfg["spreadsheet_id"] = os.environ["SPREADSHEET_ID"].strip()
        cfg["repository_backend"] = "sheets"

    if os.environ.get("GCP_SERVICE_ACCOUNT_JSON"):
        cfg["gcp_service_account"] = json.loads(
            os.environ["GCP_SERVICE_ACCOUNT_JSON"]
        )
        cfg["repository_backend"] = "sheets"

    if os.environ.get("SLACK_BOT_TOKEN"):
        cfg["slack_bot_token"] = os.environ["SLACK_BOT_TOKEN"].strip()

    return cfg


def _build_repo_and_notifier(
    cfg: dict[str, Any], today: date, dry_run: bool
) -> tuple[Repository, Notifier]:
    """設定辞書から Repository と Notifier を構築する。"""
    backend = str(cfg.get("repository_backend", "memory")).strip().lower()
    if backend == "sheets":
        spreadsheet_id = str(cfg.get("spreadsheet_id", "")).strip()
        sa_info = cfg.get("gcp_service_account")
        if not spreadsheet_id or not isinstance(sa_info, dict):
            raise ValueError(
                "repository_backend='sheets' には spreadsheet_id と gcp_service_account が必要です。"
            )
        repo: Repository = SheetsRepository.from_service_account_info(
            service_account_info=dict(sa_info),
            spreadsheet_id=spreadsheet_id,
        )
    else:
        repo = InMemoryRepository.create_with_dummy_data(today=today)

    if dry_run:
        return repo, DummyNotifier()

    token = str(cfg.get("slack_bot_token", "")).strip()
    if not token and isinstance(cfg.get("slack"), dict):
        token = str(cfg["slack"].get("bot_token", "")).strip()

    if not token or token.startswith("xoxb-your-"):
        raise ValueError(
            "実送信を行うには SLACK_BOT_TOKEN 環境変数または secrets.toml の slack_bot_token を設定してください（テスト表示のみの場合は --dry-run を付けてください）。"
        )

    return repo, SlackNotifier(bot_token=token)


def main() -> None:
    """コマンドライン引数を解析し、日次処理を実行して結果を表示する。"""
    parser = argparse.ArgumentParser(
        description="JASC79 毎朝の定時処理（日次スナップショット・毎朝まとめ・個人DM・週次まとめ）"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Slack 送信やシート書き込みを行わず、送信予定の通知内容を表示する",
    )
    parser.add_argument(
        "--date",
        type=str,
        default="",
        help="基準日を YYYY-MM-DD で指定（省略時は Asia/Tokyo の今日）",
    )
    args = parser.parse_args()

    now = datetime.now(JST)
    if args.date:
        parsed_date = date.fromisoformat(args.date)
        now = datetime(
            parsed_date.year,
            parsed_date.month,
            parsed_date.day,
            8,
            0,
            tzinfo=JST,
        )

    cfg = _load_runtime_config()
    repo, notifier = _build_repo_and_notifier(
        cfg=cfg, today=now.date(), dry_run=args.dry_run
    )

    res = run_daily_job(
        repo=repo,
        notifier=notifier,
        now=now,
        dry_run=args.dry_run,
    )

    mode_str = "【DRY-RUN（送信なし）】" if res.dry_run else "【本番実行】"
    print(f"=== {mode_str} 基準日: {res.date_key} ===")
    print(f"📊 生成された daily_snapshots 行数: {res.snapshot_count} 行")

    print("\n--- 📢 毎朝のまとめ（F12） ---")
    print(res.morning_summary_text)
    if not res.dry_run:
        print(
            f"👉 チャンネル投稿結果: {'送信完了' if res.morning_summary_sent else 'スキップ（summary_channel_id 未設定または本日送信済み）'}"
        )

    print(f"\n--- 💬 個人 DM リマインド（F18：対象 {len(res.planned_dms)} 名） ---")
    if not res.planned_dms:
        print("（本日送信対象の個人 DM はありません）")
    else:
        for member_id, slack_uid, dm_body in res.planned_dms:
            print(f"\n[宛先 member_id={member_id} / slack_user_id={slack_uid}]")
            print(dm_body)

    if res.weekly_summary_text:
        print("\n--- 🎉 週次の完了まとめ（F19：月曜のみ） ---")
        print(res.weekly_summary_text)
        if not res.dry_run:
            print(
                f"👉 週次まとめ投稿結果: {'送信完了' if res.weekly_summary_sent else 'スキップ（summary_channel_id 未設定または本日送信済み）'}"
            )


if __name__ == "__main__":
    main()
