"""F1 / S1：Google OIDC 認証とメンバー名簿（active=TRUE）によるアクセス制御。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Literal
import streamlit as st

from core.i18n import t
from core.models import LangCode, Member
from core.repository import Repository

AuthStatus = Literal["unauthenticated", "unauthorized", "authorized"]


@dataclass(frozen=True)
class AuthResult:
    """認証・名簿照合の結果を表すデータクラス。"""

    status: AuthStatus
    member: Member | None = None
    email: str = ""


def verify_member_access(
    is_logged_in: bool,
    email: str | None,
    members: Iterable[Member],
) -> AuthResult:
    """ログイン状態とメールアドレスを受け取り、active なメンバー名簿と照合する（F1 / S1）。

    - メールアドレスは前後の空白を除き、小文字（lowercase）に統一して比較する。
    - 未ログイン・空メールは `unauthenticated` を返す。
    - 名簿に存在しない、または `active=False` の場合は `unauthorized` を返す。
    - 一致する `active=True` のメンバーがいれば `authorized` とその `Member` を返す。
    """
    if not is_logged_in or not email or not email.strip():
        return AuthResult(status="unauthenticated", member=None, email="")

    normalized_email = email.strip().lower()
    for m in members:
        if m.email.strip().lower() == normalized_email:
            if m.active:
                return AuthResult(
                    status="authorized",
                    member=m,
                    email=normalized_email,
                )
            return AuthResult(
                status="unauthorized",
                member=None,
                email=normalized_email,
            )

    return AuthResult(
        status="unauthorized",
        member=None,
        email=normalized_email,
    )


def get_current_auth_state() -> tuple[bool, str | None]:
    """現在の Streamlit セッションから (is_logged_in, email) を取得する。

    自動テスト（pytest / AppTest）で `_test_auth_override` が指定されている場合はそれを優先し、
    通常実行時は `st.user`（Streamlit OIDC）からログイン状態とメールアドレスを取得する。
    """
    if "_test_auth_override" in st.session_state:
        override = st.session_state["_test_auth_override"]
        if isinstance(override, tuple) and len(override) == 2:
            return bool(override[0]), override[1]

    try:
        user_obj = getattr(st, "user", None)
        if user_obj is None:
            return False, None
        is_logged_in = bool(getattr(user_obj, "is_logged_in", False))
        if not is_logged_in:
            return False, None
        email = getattr(user_obj, "email", None)
        if email is None and hasattr(user_obj, "get"):
            email = user_obj.get("email")
        return True, str(email) if email else None
    except Exception:
        return False, None


def _is_oidc_configured() -> bool:
    """secrets.toml に [auth] 設定が存在するかを確認する。"""
    try:
        auth_cfg = st.secrets.get("auth")
        return bool(auth_cfg)
    except Exception:
        return False


def require_authenticated_member(
    repo: Repository, lang: LangCode = "ja"
) -> Member:
    """S1 認証ゲート：どの業務データ読み込みよりも前に必ず実行し、認証済み Member を返す。

    - 未ログインの場合：ログイン案内と「Google アカウントでログイン」ボタンのみを表示して `st.stop()` する。
    - 未登録または `active=FALSE` の場合：F1 のアクセス拒否メッセージとログアウトボタンのみを表示して `st.stop()` する。
    - 承認された場合：セッションに本人情報と初期言語（`members.lang`）を設定して `Member` を返す。
    """
    is_logged_in, raw_email = get_current_auth_state()

    if not is_logged_in:
        st.title(t("auth.login_title", lang))
        st.info(t("auth.login_description", lang))
        if not _is_oidc_configured() and "_test_auth_override" not in st.session_state:
            st.warning(t("auth.auth_not_configured", lang))
        if st.button(
            t("auth.login_btn", lang),
            type="primary",
            key="auth_login_btn",
        ):
            st.login("google")
        st.stop()

    # 名簿照合のために members のみを取得する（tasks 等の業務データは一切読み込まない：S1）
    all_members = repo.list_members(active_only=False)
    result = verify_member_access(is_logged_in, raw_email, all_members)

    if result.status != "authorized" or result.member is None:
        st.title(t("auth.unauthorized_title", lang))
        st.error(
            t(
                "auth.unauthorized_message",
                lang,
                email=result.email or "(unknown)",
            )
        )
        if st.button(
            t("auth.logout_btn", lang),
            key="auth_unauthorized_logout_btn",
        ):
            st.logout()
        st.stop()

    member = result.member
    st.session_state["authenticated_member"] = member
    st.session_state["current_member_id"] = member.member_id

    # ログインした本人の言語設定（members.lang）をセッションの初期言語として反映する（F11）
    if st.session_state.get("_lang_initialized_member_id") != member.member_id:
        qp_lang = st.query_params.get("lang")
        initial_lang: LangCode = (
            qp_lang
            if qp_lang in ("ja", "en")
            else (member.lang if member.lang in ("ja", "en") else "ja")
        )
        st.session_state["lang"] = initial_lang
        st.session_state["lang_choice"] = initial_lang
        st.session_state["_lang_initialized_member_id"] = member.member_id

    return member

