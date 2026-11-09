"""core/drive_scanner.py の単体テスト。"""

from core.drive_scanner import scan_document_for_pii


def test_scan_safe_document():
    text = """
    # 2026年度 JASC 会議資料
    今週の定例会では、サマーフォーラムの会場候補および全体スケジュールの検討を行いました。
    次週までに各担当がタスクを進める予定です。
    """
    res = scan_document_for_pii(text)
    assert res.is_safe is True
    assert len(res.reasons) == 0


def test_scan_detects_email():
    text = "お問い合わせ先は info@example.com までご連絡ください。"
    res = scan_document_for_pii(text)
    assert res.is_safe is False
    assert any("メールアドレス" in r for r in res.reasons)


def test_scan_detects_phone():
    text = "緊急連絡先: 090-1234-5678 (担当: 事務局)"
    res = scan_document_for_pii(text)
    assert res.is_safe is False
    assert any("電話番号" in r for r in res.reasons)


def test_scan_detects_sensitive_keywords():
    text = "今回の選考結果に関する面接評価シートを添付します。"
    res = scan_document_for_pii(text)
    assert res.is_safe is False
    assert any("機密キーワード" in r for r in res.reasons)
    assert "選考結果" in str(res.reasons)
    assert "面接評価" in str(res.reasons)
