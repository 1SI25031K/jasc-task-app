"""翻訳ファイル（locales/ja.toml, locales/en.toml）の読み込みと多言語表示ヘルパー（F11）。"""

from __future__ import annotations

from datetime import date, datetime
from functools import lru_cache
from pathlib import Path
import tomllib
from typing import Any

from core.models import (
    AssignmentKind,
    AssignmentStatus,
    LangCode,
    RoleCategory,
    TaskPriority,
    TaskSource,
    TaskStatus,
    TaskWeight,
)

LOCALES_DIR = Path(__file__).resolve().parent.parent / "locales"


@lru_cache(maxsize=4)
def load_locale(lang: LangCode) -> dict[str, Any]:
    """指定言語（ja または en）の TOML ファイルを読み込んで辞書として返す。"""
    target = "en" if lang == "en" else "ja"
    path = LOCALES_DIR / f"{target}.toml"
    with path.open("rb") as f:
        return tomllib.load(f)


def t(key: str, lang: LangCode = "ja", **kwargs: Any) -> str:
    """ドット区切りのキー（例：'board.title'）から翻訳文字列を取得し、変数を埋め込んで返す。"""
    data = load_locale(lang)
    current: Any = data
    for part in key.split("."):
        if isinstance(current, dict) and part in current:
            current = current[part]
        else:
            return key
    if not isinstance(current, str):
        return key
    if kwargs:
        try:
            return current.format(**kwargs)
        except KeyError:
            return current
    return current


_CATEGORY_KEYS: dict[RoleCategory, str] = {
    "主役職": "category.main",
    "副役職": "category.sub",
    "サイト": "category.site",
    "その他": "category.other",
}

_STATUS_KEYS: dict[TaskStatus, str] = {
    "未着手": "status.not_started",
    "進行中": "status.in_progress",
    "待ち": "status.waiting",
    "完了": "status.done",
}

_ASSIGNMENT_STATUS_KEYS: dict[AssignmentStatus, str] = {
    "承諾済": "assignment_status.accepted",
    "依頼中": "assignment_status.pending",
    "相談中": "assignment_status.consulting",
}

_WEIGHT_KEYS: dict[TaskWeight, str] = {
    "軽": "weight.light",
    "中": "weight.medium",
    "重": "weight.heavy",
}

_PRIORITY_KEYS: dict[TaskPriority, str] = {
    "高": "priority.high",
    "中": "priority.medium",
    "低": "priority.low",
}

_SOURCE_KEYS: dict[TaskSource, str] = {
    "manual": "source.manual",
    "minutes": "source.minutes",
}

_KIND_KEYS: dict[AssignmentKind, str] = {
    "責任者": "kind.leader",
    "担当": "kind.staff",
    "サポート": "kind.support",
}


def translate_category(category: RoleCategory, lang: LangCode = "ja") -> str:
    """役職カテゴリ（主役職/副役職/サイト/その他）を翻訳する。"""
    return t(_CATEGORY_KEYS.get(category, category), lang)


def translate_status(status: TaskStatus, lang: LangCode = "ja") -> str:
    """タスクのステータス（未着手/進行中/待ち/完了）を翻訳する。"""
    return t(_STATUS_KEYS.get(status, status), lang)


def translate_assignment_status(
    status: AssignmentStatus, lang: LangCode = "ja"
) -> str:
    """依頼状態（承諾済/依頼中/相談中）を翻訳する。"""
    return t(_ASSIGNMENT_STATUS_KEYS.get(status, status), lang)


def translate_weight(weight: TaskWeight, lang: LangCode = "ja") -> str:
    """重さ（軽/中/重）を翻訳する。"""
    return t(_WEIGHT_KEYS.get(weight, weight), lang)


def translate_priority(priority: TaskPriority, lang: LangCode = "ja") -> str:
    """優先度（高/中/低）を翻訳する。"""
    return t(_PRIORITY_KEYS.get(priority, priority), lang)


def translate_source(source: TaskSource, lang: LangCode = "ja") -> str:
    """作成元（manual/minutes）を翻訳する。"""
    return t(_SOURCE_KEYS.get(source, source), lang)


def translate_assignment_kind(
    kind: AssignmentKind, lang: LangCode = "ja"
) -> str:
    """担当区分（責任者/担当/サポート）を翻訳する。"""
    return t(_KIND_KEYS.get(kind, kind), lang)


def format_date(d: date | None, lang: LangCode = "ja") -> str:
    """日付を言語に応じた形式（ja: YYYY/MM/DD、en: YYYY-MM-DD）で整形する（F11）。"""
    if d is None:
        return t("common.none", lang)
    if lang == "en":
        return d.strftime("%b %d, %Y")
    return d.strftime("%Y/%m/%d")


def format_datetime(dt: datetime | None, lang: LangCode = "ja") -> str:
    """日時を言語に応じた形式で整形する。"""
    if dt is None:
        return t("common.none", lang)
    if lang == "en":
        return dt.strftime("%b %d, %Y %H:%M")
    return dt.strftime("%Y/%m/%d %H:%M")

