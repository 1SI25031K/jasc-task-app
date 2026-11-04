"""フェーズ5：SlackNotifier（1回リトライ）および scripts/daily_job.py（--dry-run・二重送信防止・途中失敗時の再実行・月曜週次まとめ）の単体テスト。"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any
import pytest

from core.models import JST
from core.notifier import DummyNotifier, SlackNotifier
from core.repository import InMemoryRepository
from core.settings import AppSettings
from scripts.daily_job import run_daily_job


class FakeSlackWebClient:
    """slack_sdk.WebClient の振る舞いを模倣するテスト用フェイククライアント。"""

    def __init__(
        self,
        fail_channel_times: int = 0,
        fail_dm_times_by_user: dict[str, int] | None = None,
    ) -> None:
        self.fail_channel_times = fail_channel_times
        self.fail_dm_times_by_user = dict(fail_dm_times_by_user or {})
        self.channel_posts: list[tuple[str, str]] = []
        self.dm_posts: list[tuple[str, str]] = []
        self.open_calls: list[list[str]] = []

    def chat_postMessage(self, channel: str, text: str) -> dict[str, Any]:
        if channel.startswith("D_"):
            user_id = channel.removeprefix("D_")
            remaining_fails = self.fail_dm_times_by_user.get(user_id, 0)
            if remaining_fails > 0:
                self.fail_dm_times_by_user[user_id] = remaining_fails - 1
                raise RuntimeError(f"Simulated DM failure for {user_id}")
            self.dm_posts.append((user_id, text))
            return {"ok": True}

        if self.fail_channel_times > 0:
            self.fail_channel_times -= 1
            raise RuntimeError("Simulated channel post failure")
        self.channel_posts.append((channel, text))
        return {"ok": True}

    def conversations_open(self, users: list[str]) -> dict[str, Any]:
        self.open_calls.append(users)
        return {"ok": True, "channel": {"id": f"D_{users[0]}"}}


def test_slack_notifier_single_retry_on_failure() -> None:
    """SlackNotifier が1回目の失敗時に1回だけ再試行して成功し、2回連続失敗時は例外を送出することを確認する。"""
    # 1. 1回失敗 → 2回目で成功するケース
    fake_client_ok = FakeSlackWebClient(
        fail_channel_times=1,
        fail_dm_times_by_user={"U001": 1},
    )
    notifier = SlackNotifier(client=fake_client_ok)

    notifier.send_channel_message("C_SUMMARY", "テストまとめ投稿")
    assert len(fake_client_ok.channel_posts) == 1
    assert fake_client_ok.channel_posts[0] == ("C_SUMMARY", "テストまとめ投稿")

    notifier.send_dm("U001", "テスト個人DM")
    assert len(fake_client_ok.dm_posts) == 1
    assert fake_client_ok.dm_posts[0] == ("U001", "テスト個人DM")

    # 2. 2回連続で失敗するケース → 例外が送出される
    fake_client_fail = FakeSlackWebClient(
        fail_channel_times=2,
        fail_dm_times_by_user={"U002": 2},
    )
    notifier_fail = SlackNotifier(client=fake_client_fail)

    with pytest.raises(RuntimeError):
        notifier_fail.send_channel_message("C_SUMMARY", "失敗する投稿")

    with pytest.raises(RuntimeError):
        notifier_fail.send_dm("U002", "失敗するDM")


def test_daily_job_dry_run_does_not_send_or_write_logs() -> None:
    """--dry-run 時は Slack 送信も daily_snapshots / reminder_log への書き込みも行われないことを確認する。"""
    # 2026-11-02 は月曜日（週次まとめも生成される）
    monday_now = datetime(2026, 11, 2, 8, 0, tzinfo=JST)
    repo = InMemoryRepository.create_with_dummy_data(today=monday_now.date())
    repo._settings = AppSettings(
        summary_channel_id="C_TEST_CHAN",
        app_url="https://jasc79.streamlit.app",
    )
    notifier = DummyNotifier()

    res = run_daily_job(
        repo=repo,
        notifier=notifier,
        now=monday_now,
        dry_run=True,
    )

    assert res.dry_run is True
    assert res.snapshot_count > 0
    assert "JASC79 毎朝の NA まとめ" in res.morning_summary_text
    assert "JASC79 週次まとめ" in res.weekly_summary_text
    assert len(res.planned_dms) > 0

    # dry_run なので実際には1件も送信されておらず、シートにも書き込まれていないこと
    assert len(notifier.sent_channel_messages) == 0
    assert len(notifier.sent_dms) == 0
    assert len(repo.list_reminder_logs()) == 0
    assert len(repo.list_daily_snapshots()) == 0


def test_daily_job_idempotency_and_partial_failure_recovery() -> None:
    """途中で一部のメンバーへの DM 送信が失敗しても、成功分は reminder_log に記録され、再実行で二重送信にならないことを確認する。"""
    # 2026-11-02（月曜）
    monday_now = datetime(2026, 11, 2, 8, 0, tzinfo=JST)
    repo = InMemoryRepository.create_with_dummy_data(today=monday_now.date())
    repo._settings = AppSettings(
        summary_channel_id="C_TEST_CHAN",
        app_url="https://jasc79.streamlit.app",
    )

    # 1回目の実行：U00000002（メンバーB）への DM が2回連続で失敗するように設定
    fake_client_1 = FakeSlackWebClient(
        fail_dm_times_by_user={"U00000002": 2},
    )
    notifier_1 = SlackNotifier(client=fake_client_1)

    with pytest.raises(RuntimeError):
        run_daily_job(
            repo=repo,
            notifier=notifier_1,
            now=monday_now,
            dry_run=False,
        )

    # 毎朝のまとめ（F12）と週次まとめ（F19）は送信済みであり、U00000002 以外のメンバーへの DM は送信成功して reminder_log に記録されていること
    assert len(fake_client_1.channel_posts) == 2
    sent_users_first_run = [uid for uid, _ in fake_client_1.dm_posts]
    assert "U00000001" in sent_users_first_run
    assert "U00000002" not in sent_users_first_run

    # 2回目の再実行（同じ日）：今度は障害が解消されたクライアントで実行
    fake_client_2 = FakeSlackWebClient()
    notifier_2 = SlackNotifier(client=fake_client_2)

    res_2 = run_daily_job(
        repo=repo,
        notifier=notifier_2,
        now=monday_now,
        dry_run=False,
    )

    # 1回目で成功していた毎朝のまとめ（F12）・週次まとめ（F19）・他メンバーへの DM は再送されず、
    # 1回目に失敗していた U00000002（m002）への DM だけが送信されること！
    assert res_2.morning_summary_sent is False
    assert res_2.weekly_summary_sent is False
    assert len(fake_client_2.channel_posts) == 0
    assert res_2.sent_dm_member_ids == ["m002"]
    assert [uid for uid, _ in fake_client_2.dm_posts] == ["U00000002"]

    # 3回目の再実行（同じ日）：すべて送信済みなのでチャンネル投稿も DM も 0件になること
    fake_client_3 = FakeSlackWebClient()
    notifier_3 = SlackNotifier(client=fake_client_3)
    res_3 = run_daily_job(
        repo=repo,
        notifier=notifier_3,
        now=monday_now,
        dry_run=False,
    )
    assert res_3.morning_summary_sent is False
    assert res_3.weekly_summary_sent is False
    assert res_3.sent_dm_member_ids == []
    assert len(fake_client_3.channel_posts) == 0
    assert len(fake_client_3.dm_posts) == 0
