"""core/na_extractor.py（5.7・S12 AI出力の検証・2万文字制限・ダミー抽出）の単体テスト。"""

from datetime import date
import pytest

from core.models import Member, Role
from core.na_extractor import (
    DummyNaExtractor,
    MAX_EVIDENCE_LENGTH,
    MAX_MINUTES_LENGTH,
    MAX_NA_LENGTH,
    MAX_TITLE_LENGTH,
    MinutesTooLongError,
    is_candidate_ready_to_save,
    validate_and_sanitize_candidates,
)


def test_validate_and_sanitize_candidates_invalid_ids_dates_and_lengths() -> None:
    """存在しないID・不正な日付・長すぎる文字列・不正な重さがすべて安全に補正されることを確認する（5.7）。"""
    valid_members = {"m001", "m002"}
    valid_roles = {"r_finance", "r_pr"}

    raw_outputs = [
        {
            "title": "あ" * (MAX_TITLE_LENGTH + 50),  # 長すぎるタイトル
            "next_action": "い" * (MAX_NA_LENGTH + 50),  # 長すぎるNA
            "owner_member_id": "m999_non_existent",  # 存在しないメンバーID
            "role_ids": ["r_finance", "r_unknown"],  # 存在しない役職IDが混在
            "na_due": "2026-02-30",  # 存在しない日付
            "weight": "超重",  # 不正な重さ
            "evidence": "う" * (MAX_EVIDENCE_LENGTH + 50),  # 長すぎる引用
        },
        {
            "title": "正常なタスク",
            "next_action": "メールを送る",
            "owner_member_id": "m001",
            "role_ids": "r_pr, r_finance",  # カンマ区切り文字列でも受け取れる
            "na_due": "2026-11-15",
            "weight": "重",
            "evidence": "議事メモの引用",
        },
    ]

    candidates = validate_and_sanitize_candidates(
        raw_candidates=raw_outputs,
        valid_member_ids=valid_members,
        valid_role_ids=valid_roles,
    )

    assert len(candidates) == 2

    c1 = candidates[0]
    assert len(c1.title) == MAX_TITLE_LENGTH
    assert len(c1.next_action) == MAX_NA_LENGTH
    assert len(c1.evidence) == MAX_EVIDENCE_LENGTH
    assert c1.owner_member_id == ""  # 存在しないIDは空になる
    assert c1.role_ids == ["r_finance"]  # 存在するIDのみ残る
    assert c1.na_due is None  # 不正な日付はNoneになる
    assert c1.weight == "中"  # 不正な重さは既定値「中」になる
    # 担当者・期限が空なので、そのままでは登録不可（5.7）
    assert is_candidate_ready_to_save(c1) is False

    c2 = candidates[1]
    assert c2.owner_member_id == "m001"
    assert c2.role_ids == ["r_pr", "r_finance"]
    assert c2.na_due == date(2026, 11, 15)
    assert c2.weight == "重"
    assert is_candidate_ready_to_save(c2) is True


def test_minutes_too_long_error_and_masking_in_extractor() -> None:
    """2万文字を超える議事メモはエラーになり、通常時はマスキングされメールアドレスがAIに渡らないことを確認する。"""
    roles = [Role("r_chair", "実行委員長", "Chair", "主役職", 10, True)]
    members = [
        Member(
            member_id="m001",
            display_name="メンバーA",
            display_name_en="Member A",
            email="secret_email@example.com",
        )
    ]
    extractor = DummyNaExtractor()

    # 20,001 文字はエラー
    with pytest.raises(MinutesTooLongError):
        extractor.extract(
            raw_minutes="a" * (MAX_MINUTES_LENGTH + 1),
            meeting_date=date(2026, 11, 3),
            roles=roles,
            members=members,
        )

    # 正常実行時、議事メモ内のメール・電話がマスクされ、メンバーのemailがコンテキストに含まれないこと
    results = extractor.extract(
        raw_minutes="連絡先は test@example.com と 090-1234-5678 です。",
        meeting_date=date(2026, 11, 3),
        roles=roles,
        members=members,
    )
    assert len(results) == 2
    assert extractor.last_context is not None
    assert "[メール]" in extractor.last_context.masked_minutes
    assert "[電話番号]" in extractor.last_context.masked_minutes
    assert "secret_email@example.com" not in str(extractor.last_context.members)

