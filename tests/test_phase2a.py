"""フェーズ2-A（i18n・タスク作成/編集/アーカイブ/履歴・全タスク絞り込み・各画面）の単体テスト。"""

from datetime import date, datetime
from pathlib import Path
from streamlit.testing.v1 import AppTest

from core.i18n import (
    format_date,
    load_locale,
    t,
    translate_assignment_status,
    translate_category,
    translate_status,
    translate_weight,
)
from core.models import JST
from core.repository import InMemoryRepository
from core.services import (
    apply_full_task_update,
    apply_quick_na_update,
    build_member_load_label,
    create_new_task,
    filter_tasks,
    toggle_archive_task,
)


def test_i18n_keys_match_between_ja_and_en() -> None:
    """ja.toml と en.toml のすべてのセクションとキーが一致し、翻訳関数が動作することを確認する（F11）。"""
    ja = load_locale("ja")
    en = load_locale("en")
    assert set(ja.keys()) == set(en.keys())
    for sec in ja:
        assert set(ja[sec].keys()) == set(en[sec].keys()), f"Mismatch in [{sec}]"

    assert t("board.title", "ja") == "役職ボード"
    assert t("board.title", "en") == "Role Board"
    assert translate_category("主役職", "en") == "Main Roles"
    assert translate_status("進行中", "en") == "In Progress"
    assert translate_assignment_status("依頼中", "en") == "Pending Request"
    assert translate_weight("重", "en") == "Heavy"
    assert format_date(date(2026, 11, 3), "ja") == "2026/11/03"
    assert format_date(date(2026, 11, 3), "en") == "Nov 03, 2026"


def test_member_load_label_and_task_crud_with_history() -> None:
    """担当者選択肢の負荷表示（F7/F8）と、タスク作成・簡易NA更新・全項目編集・アーカイブ/復元・履歴（F7〜F10）を確認する。"""
    today = date(2026, 11, 3)
    now = datetime(2026, 11, 3, 10, 0, tzinfo=JST)
    repo = InMemoryRepository.create_with_dummy_data(today=today)

    members = repo.list_members()
    tasks = repo.list_tasks()
    checkins = repo.list_checkins()

    label_ja = build_member_load_label(
        members[0], tasks, checkins, today, "ja"
    )
    assert "メンバーA（自動 " in label_ja
    assert "pt／体感 9）" in label_ja

    label_en = build_member_load_label(
        members[0], tasks, checkins, today, "en"
    )
    assert "Member A (Auto " in label_en
    assert "pt / Subj 9)" in label_en

    # F7: 自分以外（m002）を担当者にして作成すると「依頼中」になる
    new_task, create_logs = create_new_task(
        title="テスト新規タスク",
        role_ids=["r_chair"],
        owner_member_id="m002",
        creator_member_id="m001",
        weight="中",
        next_action="最初のNA",
        na_due=today,
        now=now,
    )
    assert new_task.assignment_status == "依頼中"
    assert new_task.requested_by == "m001"
    assert len(create_logs) == 2

    # F8: 簡易NA更新
    q_task, q_logs = apply_quick_na_update(
        task=new_task,
        next_action="更新後のNA",
        na_due=today,
        status="進行中",
        actor_member_id="m002",
        now=now,
    )
    assert q_task.next_action == "更新後のNA"
    assert q_task.status == "進行中"
    assert len(q_logs) == 2

    # F8: 全項目編集（担当者を m003 に変更すると再び「依頼中」になる）
    f_task, f_logs = apply_full_task_update(
        task=q_task,
        title="タイトル変更",
        role_ids=["r_chair", "r_finance"],
        owner_member_id="m003",
        weight="重",
        next_action="更新後のNA",
        na_due=today,
        task_due=None,
        status="完了",
        waiting_on_member_id="",
        priority="高",
        blocker="",
        notes="メモ追記",
        actor_member_id="m001",
        now=now,
    )
    assert f_task.owner_member_id == "m003"
    assert f_task.assignment_status == "依頼中"
    assert f_task.completed_at == now
    assert any(log.action == "request" for log in f_logs)

    # F9: アーカイブと復元
    arch_task, arch_log = toggle_archive_task(
        f_task, archived=True, actor_member_id="m001", now=now
    )
    assert arch_task.archived is True
    assert arch_log.action == "archive"

    rest_task, rest_log = toggle_archive_task(
        arch_task, archived=False, actor_member_id="m001", now=now
    )
    assert rest_task.archived is False
    assert rest_log.action == "restore"


def test_filter_tasks_f6() -> None:
    """F6 全タスク一覧のフィルタが正しく動作することを確認する。"""
    today = date(2026, 11, 3)
    repo = InMemoryRepository.create_with_dummy_data(today=today)
    all_tasks = repo.list_tasks(include_archived=True)

    fin_tasks = filter_tasks(all_tasks, role_id="r_finance")
    assert len(fin_tasks) > 0
    assert all("r_finance" in t.role_ids for t in fin_tasks)

    pending_tasks = filter_tasks(all_tasks, assignment_status="依頼中")
    assert len(pending_tasks) > 0
    assert all(t.assignment_status == "依頼中" for t in pending_tasks)


def test_pages_2a_and_2b_render_without_exception() -> None:
    """フェーズ2の全10画面が日本語・英語ともにエラーなく描画され、操作が動作することを確認する。"""
    app_path = Path(__file__).resolve().parent.parent / "app.py"
    all_page_files = [
        "pages/board.py",
        "pages/role_detail.py",
        "pages/my_tasks.py",
        "pages/alerts.py",
        "pages/all_tasks.py",
        "pages/inbox.py",
        "pages/checkin.py",
        "pages/capacity_map.py",
        "pages/progress.py",
        "pages/minutes.py",
    ]
    for page_file in all_page_files:
        at = AppTest.from_file(str(app_path), default_timeout=15).run()
        at.switch_page(page_file).run()
        assert not at.exception, f"Exception on {page_file} (ja): {at.exception}"

        # 英語に切り替えても例外が出ないことを確認
        at.session_state["lang"] = "en"
        at.session_state["lang_choice"] = "en"
        at.run()
        assert not at.exception, f"Exception on {page_file} (en): {at.exception}"

    # F16 体感負荷チェックイン：ボタン1クリックで回答できることを確認
    at_checkin = AppTest.from_file(str(app_path), default_timeout=15).run()
    at_checkin.switch_page("pages/checkin.py").run()
    at_checkin.button(key="checkin_btn_7").click().run()
    assert not at_checkin.exception
    assert len(at_checkin.success) == 1

    # F14 議事メモからNA生成：候補抽出ボタンが動くことを確認
    at_min = AppTest.from_file(str(app_path), default_timeout=15).run()
    at_min.switch_page("pages/minutes.py").run()
    at_min.button(key="minutes_extract_btn").click().run()
    assert not at_min.exception
    assert len(at_min.session_state["extracted_na_candidates"]) == 2

