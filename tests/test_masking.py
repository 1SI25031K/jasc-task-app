"""core/masking.py（5.7 メールアドレス・電話番号のマスキング）の単体テスト。"""

from core.masking import mask_personal_info


def test_mask_email_variations() -> None:
    """一般的なメール・サブドメイン・プラス記号付きのメールがすべて [メール] に置換されることを確認する。"""
    text = (
        "連絡先は member_a@example.com または "
        "jasc.79+test@sub.university.ac.jp までお願いします。"
    )
    masked = mask_personal_info(text)
    assert "member_a@example.com" not in masked
    assert "jasc.79+test@sub.university.ac.jp" not in masked
    assert masked == "連絡先は [メール] または [メール] までお願いします。"


def test_mask_japanese_phone_numbers() -> None:
    """日本の携帯電話・固定電話・フリーダイヤル・+81表記・ハイフンなしがすべて [電話番号] に置換されることを確認する。"""
    samples = [
        ("携帯（ハイフンあり）: 090-1234-5678", "携帯（ハイフンあり）: [電話番号]"),
        ("携帯（080スペース区切り）: 080 9876 5432", "携帯（080スペース区切り）: [電話番号]"),
        ("携帯（070ハイフンなし）: 07011112222", "携帯（070ハイフンなし）: [電話番号]"),
        ("国際表記: +81-90-1234-5678", "国際表記: [電話番号]"),
        ("東京固定: 03-1234-5678", "東京固定: [電話番号]"),
        ("大阪カッコ付き: (06)1234-5678", "大阪カッコ付き: [電話番号]"),
        ("地方固定（札幌）: 011-234-5678", "地方固定（札幌）: [電話番号]"),
        ("固定ハイフンなし10桁: 0312345678", "固定ハイフンなし10桁: [電話番号]"),
        ("フリーダイヤル: 0120-123-456", "フリーダイヤル: [電話番号]"),
    ]
    for raw, expected in samples:
        assert mask_personal_info(raw) == expected


def test_dates_and_normal_numbers_are_not_masked() -> None:
    """日付（2026-11-03）や通常の金額・時刻が誤って電話番号としてマスクされないことを確認する。"""
    text = "次回定例会は 2026-11-03 の 19:00 から、予算は 150,000 円です。"
    assert mask_personal_info(text) == text

