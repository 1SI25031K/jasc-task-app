"""フェーズ4：Google OIDC 認証・メンバー名簿照合・S1 認証ゲートの単体テスト。"""

from __future__ import annotations

from datetime import date
from pathlib import Path
from streamlit.testing.v1 import AppTest

from core.auth import verify_member_access
from core.models import Member
from core.repository import InMemoryRepository


def test_verify_member_access_case_insensitive_and_active_check() -> None:
    """メールアドレスの小文字正規化、未登録メール拒否、active=False 拒否を確認する（F1 / S1）。"""
    members = [
        Member(
            member_id="m001",
            display_name="メンバーA",
            display_name_en="Member A",
            email="Member_A@Example.com",
            slack_user_id="U001",
            lang="ja",
            reminders_enabled=True,
            active=True,
        ),
        Member(
            member_id="m009",
            display_name="休止メンバー",
            display_name_en="Inactive Member",
            email="inactive@example.com",
            slack_user_id="U009",
            lang="en",
            reminders_enabled=False,
            active=False,
        ),
    ]

    # 1. 大文字・前後の空白混じりでも active=True なら authorized になる
    res_ok = verify_member_access(True, "  MEMBER_A@example.com ", members)
    assert res_ok.status == "authorized"
    assert res_ok.member is not None
    assert res_ok.member.member_id == "m001"
    assert res_ok.email == "member_a@example.com"

    # 2. 未登録のメールアドレスは unauthorized になる
    res_unreg = verify_member_access(True, "stranger@example.com", members)
    assert res_unreg.status == "unauthorized"
    assert res_unreg.member is None
    assert res_unreg.email == "stranger@example.com"

    # 3. 名簿にあっても active=False のメンバーは unauthorized になる
    res_inactive = verify_member_access(True, "INACTIVE@example.com", members)
    assert res_inactive.status == "unauthorized"
    assert res_inactive.member is None

    # 4. 未ログイン（is_logged_in=False）や空メールは unauthenticated になる
    res_unauth = verify_member_access(False, "member_a@example.com", members)
    assert res_unauth.status == "unauthenticated"
    assert res_unauth.member is None

    res_empty = verify_member_access(True, "   ", members)
    assert res_empty.status == "unauthenticated"


def test_s1_unauthenticated_stops_before_rendering_data() -> None:
    """未ログイン時はログインボタンのみを表示して st.stop() し、役職ボードやタスクが一切表示されないことを確認する（S1）。"""
    app_path = Path(__file__).resolve().parent.parent / "app.py"
    at = AppTest.from_file(str(app_path))
    at.session_state["_test_auth_override"] = (False, None)
    at.run()

    assert not at.exception
    assert len(at.title) == 1
    assert "ログイン" in at.title[0].value
    # ログインボタンが表示されていること
    assert any("ログイン" in b.label for b in at.button)
    # サイドバーのタスク作成ボタンやナビゲーション後の役職ボードが表示されていないこと
    assert len(at.sidebar.button) == 0


def test_s1_unauthorized_email_stops_and_never_loads_tasks() -> None:
    """未登録アカウントでログインした場合、F1 の拒否メッセージとログアウトボタンのみを表示し、list_tasks() 等の業務データが一度も呼ばれないことを確認する（F1 / S1）。"""

    class SpyRepository(InMemoryRepository):
        """list_tasks 等が呼ばれたら記録するスパイリポジトリ。"""

        def __init__(self, *args, **kwargs) -> None:
            super().__init__(*args, **kwargs)
            self.tasks_loaded = False

        def list_tasks(self, include_archived: bool = False):
            self.tasks_loaded = True
            return super().list_tasks(include_archived=include_archived)

    base = InMemoryRepository.create_with_dummy_data(today=date(2026, 11, 3))
    spy_repo = SpyRepository(
        members=base.list_members(active_only=False),
        roles=base.list_roles(active_only=False),
        role_assignments=base.list_role_assignments(),
        tasks=base.list_tasks(include_archived=True),
        settings=base.get_settings(),
    )

    app_path = Path(__file__).resolve().parent.parent / "app.py"
    at = AppTest.from_file(str(app_path))
    at.session_state["repo"] = spy_repo
    at.session_state["_test_auth_override"] = (True, "outsider@example.com")
    at.run()

    assert not at.exception
    # F1 のアクセス拒否エラーメッセージが表示されていること
    assert len(at.error) == 1
    assert "outsider@example.com" in at.error[0].value
    assert "アクセス権がありません" in at.error[0].value
    # ログアウトボタンのみが存在し、サイドバー等は表示されないこと
    assert len(at.button) == 1
    assert "ログアウト" in at.button[0].label
    assert len(at.sidebar.button) == 0
    # S1：業務データ（list_tasks）が一度も読み込まれていないこと
    assert spy_repo.tasks_loaded is False


def test_authenticated_member_binds_lang_and_identity() -> None:
    """登録済みメンバー（例：member_f@example.com, lang='en'）でログインすると、本人の名前・初期言語（英語）が適用され、ホームにあいさつが表示されることを確認する。"""
    app_path = Path(__file__).resolve().parent.parent / "app.py"
    at = AppTest.from_file(str(app_path))
    # メンバーF（m006, member_f@example.com）は初期データで lang="en"
    at.session_state["_test_auth_override"] = (True, "Member_F@example.com")
    at.run()

    assert not at.exception
    assert at.session_state["current_member_id"] == "m006"
    assert at.session_state["lang"] == "en"
    assert any("Member F" in h.value for h in at.html)
    assert any("Member F" in m.value for m in at.markdown)
