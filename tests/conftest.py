"""pytest 共通フィクスチャ：テスト実行時は Google スプレッドシートや外部 OIDC 通信を行わず、InMemoryRepository とテスト用認証状態で動作させる。"""

from __future__ import annotations

import pytest
import streamlit as st

import core.auth as auth_module
import core.session as session_module
from core.notifier import DummyNotifier
from core.repository import InMemoryRepository, build_dummy_daily_snapshots


@pytest.fixture(autouse=True)
def _isolate_test_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    """AppTest 等のテスト実行時に secrets.toml の設定に依存せず、デフォルトでメンバーA（member_a@example.com）として認証済み・InMemoryRepository を使うようにする。"""
    orig_create_repo = session_module.create_repository_from_config

    def _test_create_repo(secrets_dict: dict | None = None, today=None):
        if secrets_dict is not None:
            return orig_create_repo(secrets_dict=secrets_dict, today=today)
        base_date = today or session_module.get_today()
        repo_inst = InMemoryRepository.create_with_dummy_data(today=base_date)
        repo_inst.save_daily_snapshots(
            build_dummy_daily_snapshots(
                today=base_date,
                members=repo_inst.list_members(),
                roles=repo_inst.list_roles(),
            )
        )
        return repo_inst

    monkeypatch.setattr(
        session_module, "create_repository_from_config", _test_create_repo
    )
    monkeypatch.setattr(
        session_module,
        "create_notifier_from_config",
        lambda secrets_dict=None: DummyNotifier(),
    )

    def _default_test_auth_state() -> tuple[bool, str | None]:
        if "_test_auth_override" in st.session_state:
            override = st.session_state["_test_auth_override"]
            if isinstance(override, tuple) and len(override) == 2:
                return bool(override[0]), override[1]
        return True, "member_a@example.com"

    monkeypatch.setattr(
        auth_module, "get_current_auth_state", _default_test_auth_state
    )

