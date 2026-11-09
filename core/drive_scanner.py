"""Google Drive 資料取り込み前の個人情報・機密情報検査（S16）。

メールアドレス、電話番号、および選考・健康・認証情報などのセンシティブキーワードを検知し、
検知された場合は File Search への取り込みを安全にブロックする。
"""

from __future__ import annotations

import re
from typing import NamedTuple

from core.masking import _EMAIL_PATTERN, _PHONE_PATTERNS

# センシティブキーワード一覧（選考・健康情報・機密情報）
SENSITIVE_KEYWORDS = [
    # 選考・人事
    "選考結果",
    "合格通知",
    "不合格",
    "面接評価",
    "選考基準",
    "応募者名簿",
    "エントリーシート",
    # 健康・医療
    "健康診断",
    "病歴",
    "持病",
    "診断書",
    "アレルギー詳細",
    # 認証・決済
    "口座番号",
    "暗証番号",
    "マイナンバー",
    "クレジットカード番号",
    "パスワード",
    "秘密鍵",
]


class ScanResult(NamedTuple):
    is_safe: bool
    reasons: list[str]


def scan_document_for_pii(text: str) -> ScanResult:
    """ドキュメント本文を検査し、個人情報や機密情報が含まれるか判定する（S16）。

    Parameters
    ----------
    text : str
        検査対象のドキュメント本文

    Returns
    -------
    ScanResult
        is_safe: 個人情報・機密情報が検知されなければ True
        reasons: 検知された理由のリスト
    """
    if not text:
        return ScanResult(is_safe=True, reasons=[])

    reasons: list[str] = []

    # 1. メールアドレスの検査
    emails = _EMAIL_PATTERN.findall(text)
    if emails:
        reasons.append(f"メールアドレスを検知 ({len(emails)}件)")

    # 2. 電話番号の検査
    phone_count = 0
    for pattern in _PHONE_PATTERNS:
        matches = pattern.findall(text)
        phone_count += len(matches)
    if phone_count > 0:
        reasons.append(f"電話番号を検知 ({phone_count}件)")

    # 3. センシティブキーワードの検査
    matched_keywords: list[str] = []
    for kw in SENSITIVE_KEYWORDS:
        if kw in text:
            matched_keywords.append(kw)
    if matched_keywords:
        reasons.append(f"機密キーワードを検知 ({', '.join(matched_keywords)})")

    is_safe = len(reasons) == 0
    return ScanResult(is_safe=is_safe, reasons=reasons)

