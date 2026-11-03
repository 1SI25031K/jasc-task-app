"""5.7 議事メモからの NA 候補抽出（NaExtractor インターフェース・ダミー実装・AI 出力検証）。"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any, Iterable

from core.masking import mask_personal_info
from core.models import Member, Role, TaskWeight

MAX_MINUTES_LENGTH = 20000
MAX_TITLE_LENGTH = 100
MAX_NA_LENGTH = 200
MAX_EVIDENCE_LENGTH = 300
VALID_WEIGHTS: set[str] = {"軽", "中", "重"}


class MinutesTooLongError(ValueError):
    """議事メモの文字数が上限（2万文字）を超えている場合に送出する例外（5.7）。"""


@dataclass
class NaCandidate:
    """AI が抽出し、検証を経た NA 候補の1行を表すデータクラス（5.7）。"""

    title: str
    next_action: str
    owner_member_id: str = ""
    role_ids: list[str] = field(default_factory=list)
    na_due: date | None = None
    weight: TaskWeight = "中"
    evidence: str = ""


@dataclass
class ExtractionInputContext:
    """Gemini に渡すマスキング済み議事メモとマスタ情報（メールアドレス等の秘密情報は含めない 5.7）。"""

    masked_minutes: str
    meeting_date: date
    roles: list[tuple[str, str]]  # (role_id, name)
    members: list[tuple[str, str]]  # (member_id, display_name) ※emailは渡さない


def build_extraction_context(
    raw_minutes: str,
    meeting_date: date,
    roles: Iterable[Role],
    members: Iterable[Member],
) -> ExtractionInputContext:
    """議事メモの文字数チェックと個人情報マスキングを行い、AI 送信用の安全なコンテキストを作る（5.7）。"""
    if len(raw_minutes) > MAX_MINUTES_LENGTH:
        raise MinutesTooLongError(
            f"議事メモは {MAX_MINUTES_LENGTH:,} 文字以内で入力してください（現在：{len(raw_minutes):,} 文字）。"
        )
    masked = mask_personal_info(raw_minutes)
    role_pairs = [(r.role_id, r.name) for r in roles if r.active]
    member_pairs = [(m.member_id, m.display_name) for m in members if m.active]
    return ExtractionInputContext(
        masked_minutes=masked,
        meeting_date=meeting_date,
        roles=role_pairs,
        members=member_pairs,
    )


def _parse_iso_date(raw_date: Any) -> date | None:
    """日付（date オブジェクトまたは YYYY-MM-DD 文字列）を検証して date に変換する。不正なら None。"""
    if isinstance(raw_date, date):
        return raw_date
    if not isinstance(raw_date, str):
        return None
    cleaned = raw_date.strip()
    if not cleaned:
        return None
    try:
        return date.fromisoformat(cleaned)
    except ValueError:
        return None


def _truncate(text: Any, max_len: int) -> str:
    """文字列を前後の空白除去のうえ、上限文字数で切り詰める。"""
    if not isinstance(text, str):
        return ""
    cleaned = text.strip()
    if len(cleaned) > max_len:
        return cleaned[:max_len]
    return cleaned


def validate_and_sanitize_candidates(
    raw_candidates: Iterable[dict[str, Any]],
    valid_member_ids: set[str],
    valid_role_ids: set[str],
) -> list[NaCandidate]:
    """AI が出力した辞書リストを検証し、安全な NaCandidate リストに変換する（5.7・S12）。

    検証ルール：
    - 存在しない member_id / role_id は空（除外）にする。
    - 不正な日付文字列は None（空）にする。
    - 文字数の上限を超えたら切り詰める。
    - weight が '軽'/'中'/'重' 以外なら '中' にする。
    """
    validated: list[NaCandidate] = []
    for raw in raw_candidates:
        if not isinstance(raw, dict):
            continue

        title = _truncate(raw.get("title", ""), MAX_TITLE_LENGTH)
        next_action = _truncate(raw.get("next_action", ""), MAX_NA_LENGTH)
        evidence = _truncate(raw.get("evidence", ""), MAX_EVIDENCE_LENGTH)

        owner_raw = raw.get("owner_member_id", "")
        owner_id = (
            owner_raw.strip()
            if isinstance(owner_raw, str)
            and owner_raw.strip() in valid_member_ids
            else ""
        )

        raw_roles = raw.get("role_ids", [])
        if isinstance(raw_roles, str):
            raw_roles = [r.strip() for r in raw_roles.split(",") if r.strip()]
        role_ids: list[str] = []
        if isinstance(raw_roles, list):
            for r_id in raw_roles:
                if (
                    isinstance(r_id, str)
                    and r_id.strip() in valid_role_ids
                    and r_id.strip() not in role_ids
                ):
                    role_ids.append(r_id.strip())

        na_due = _parse_iso_date(raw.get("na_due"))

        weight_raw = raw.get("weight", "中")
        weight: TaskWeight = (
            weight_raw  # type: ignore[assignment]
            if isinstance(weight_raw, str) and weight_raw in VALID_WEIGHTS
            else "中"
        )

        validated.append(
            NaCandidate(
                title=title,
                next_action=next_action,
                owner_member_id=owner_id,
                role_ids=role_ids,
                na_due=na_due,
                weight=weight,
                evidence=evidence,
            )
        )
    return validated


def is_candidate_ready_to_save(candidate: NaCandidate) -> bool:
    """候補がそのままタスクとして登録可能か（担当者・期限・タイトル・NA・役職が揃っているか）を判定する（5.7）。"""
    if not candidate.title.strip():
        return False
    if not candidate.next_action.strip():
        return False
    if not candidate.owner_member_id.strip():
        return False
    if not candidate.role_ids:
        return False
    if candidate.na_due is None:
        return False
    return True


class NaExtractor(ABC):
    """議事メモから NA 候補を抽出する抽象インターフェース（3. 設計方針）。"""

    @abstractmethod
    def extract(
        self,
        raw_minutes: str,
        meeting_date: date,
        roles: Iterable[Role],
        members: Iterable[Member],
    ) -> list[NaCandidate]:
        """議事メモから検証済みの NA 候補リストを返す。"""


class DummyNaExtractor(NaExtractor):
    """テストおよびローカル開発用のダミー NaExtractor 実装（外部通信を行わない）。"""

    def __init__(
        self, custom_raw_outputs: list[dict[str, Any]] | None = None
    ) -> None:
        """任意の生出力（未検証辞書リスト）を注入できるように初期化する。"""
        self._custom_raw_outputs = custom_raw_outputs
        self.last_context: ExtractionInputContext | None = None

    def extract(
        self,
        raw_minutes: str,
        meeting_date: date,
        roles: Iterable[Role],
        members: Iterable[Member],
    ) -> list[NaCandidate]:
        """マスキングと文字数検証を行ったうえで、ダミー候補を検証関数に通して返す。"""
        role_list = list(roles)
        member_list = list(members)
        context = build_extraction_context(
            raw_minutes=raw_minutes,
            meeting_date=meeting_date,
            roles=role_list,
            members=member_list,
        )
        self.last_context = context

        valid_member_ids = {m_id for m_id, _ in context.members}
        valid_role_ids = {r_id for r_id, _ in context.roles}

        if self._custom_raw_outputs is not None:
            raw_items = self._custom_raw_outputs
        else:
            first_member = context.members[0][0] if context.members else ""
            first_role = context.roles[0][0] if context.roles else ""
            raw_items = [
                {
                    "title": "次回定例会の資料準備",
                    "next_action": "スライドのたたき台を作成して共有フォルダに置く",
                    "owner_member_id": first_member,
                    "role_ids": [first_role] if first_role else [],
                    "na_due": (meeting_date + timedelta(days=5)).isoformat(),
                    "weight": "中",
                    "evidence": "次回までにスライドたたき台を用意することで合意",
                },
                {
                    "title": "会場候補の追加リサーチ",
                    "next_action": "候補施設に空き状況をメールで問い合わせる",
                    "owner_member_id": "",  # 担当者未定の候補（画面で入力必須の確認用）
                    "role_ids": [first_role] if first_role else [],
                    "na_due": "",  # 期限未定の候補
                    "weight": "軽",
                    "evidence": "会場の空き状況は追って担当を決めて確認する",
                },
            ]

        return validate_and_sanitize_candidates(
            raw_candidates=raw_items,
            valid_member_ids=valid_member_ids,
            valid_role_ids=valid_role_ids,
        )

