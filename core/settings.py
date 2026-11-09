"""settings シート（運用パラメータ 4.10）を既定値つきで読み込むモジュール。"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable

from core.models import SettingRow

DEFAULT_WEIGHT_POINTS: dict[str, int] = {"軽": 1, "中": 2, "重": 3}
DEFAULT_CHECKIN_WEEKDAYS: list[str] = ["月", "水", "金"]


def _parse_int(value: str | None, default: int) -> int:
    """文字列を整数に変換する。変換できない場合は既定値を返す。"""
    if value is None or not str(value).strip():
        return default
    try:
        return int(str(value).strip())
    except ValueError:
        return default


def _parse_weekdays(value: str | None, default: list[str]) -> list[str]:
    """カンマ区切りの曜日文字列（例：'月,水,金'）をリストに変換する。"""
    if value is None or not value.strip():
        return list(default)
    items = [part.strip() for part in value.split(",") if part.strip()]
    return items if items else list(default)


def _parse_weight_points(
    value: str | None, default: dict[str, int]
) -> dict[str, int]:
    """重さポイント文字列（例：'軽=1,中=2,重=3'）を辞書に変換する。"""
    result = dict(default)
    if value is None or not value.strip():
        return result
    for part in value.split(","):
        if "=" not in part:
            continue
        k, v = part.split("=", 1)
        k_clean = k.strip()
        if not k_clean:
            continue
        try:
            result[k_clean] = int(v.strip())
        except ValueError:
            continue
    return result


@dataclass
class AppSettings:
    """4.10 settings シートの全運用パラメータを保持するデータクラス。"""

    checkin_weekdays: list[str] = field(
        default_factory=lambda: list(DEFAULT_CHECKIN_WEEKDAYS)
    )
    daily_job_time: str = "08:00"
    load_window_days: int = 14
    weight_points: dict[str, int] = field(
        default_factory=lambda: dict(DEFAULT_WEIGHT_POINTS)
    )
    overdue_escalation_days: int = 3
    stale_days: int = 7
    request_reminder_days: int = 2
    high_load_score: int = 8
    high_load_consecutive: int = 2
    summary_channel_id: str = ""
    admin_channel_id: str = ""
    app_url: str = ""
    feature_ai_search: str = "FALSE"
    rate_limit_ai_search_per_minute: int = 5
    rate_limit_ai_search_per_day: int = 50
    drive_ai_shared_folder_id: str = ""
    gemini_file_search_store_name: str = ""
    feature_drive_file_search: str = "FALSE"

    @classmethod
    def from_dict(cls, raw: dict[str, str] | None = None) -> AppSettings:
        """キーと値の辞書から AppSettings を生成する。未指定・不正な値は既定値で補完する。"""
        data = raw or {}
        daily_job_time_raw = data.get("daily_job_time", "").strip()
        return cls(
            checkin_weekdays=_parse_weekdays(
                data.get("checkin_weekdays"), DEFAULT_CHECKIN_WEEKDAYS
            ),
            daily_job_time=daily_job_time_raw if daily_job_time_raw else "08:00",
            load_window_days=_parse_int(data.get("load_window_days"), 14),
            weight_points=_parse_weight_points(
                data.get("weight_points"), DEFAULT_WEIGHT_POINTS
            ),
            overdue_escalation_days=_parse_int(
                data.get("overdue_escalation_days"), 3
            ),
            stale_days=_parse_int(data.get("stale_days"), 7),
            request_reminder_days=_parse_int(
                data.get("request_reminder_days"), 2
            ),
            high_load_score=_parse_int(data.get("high_load_score"), 8),
            high_load_consecutive=_parse_int(
                data.get("high_load_consecutive"), 2
            ),
            summary_channel_id=data.get("summary_channel_id", "").strip(),
            admin_channel_id=data.get("admin_channel_id", "").strip(),
            app_url=data.get("app_url", "").strip(),
            feature_ai_search=data.get("feature_ai_search", "FALSE").strip().upper(),
            rate_limit_ai_search_per_minute=_parse_int(
                data.get("rate_limit_ai_search_per_minute"), 5
            ),
            rate_limit_ai_search_per_day=_parse_int(
                data.get("rate_limit_ai_search_per_day"), 50
            ),
            drive_ai_shared_folder_id=data.get("drive_ai_shared_folder_id", "").strip(),
            gemini_file_search_store_name=data.get("gemini_file_search_store_name", "").strip(),
            feature_drive_file_search=data.get("feature_drive_file_search", "FALSE").strip().upper(),
        )

    @classmethod
    def from_rows(cls, rows: Iterable[SettingRow]) -> AppSettings:
        """SettingRow のイテラブルから AppSettings を生成する。"""
        raw = {row.key: row.value for row in rows}
        return cls.from_dict(raw)

    def to_rows(self) -> list[SettingRow]:
        """現在の設定値を SettingRow のリストに変換する。"""
        weight_str = ",".join(
            f"{k}={v}" for k, v in self.weight_points.items()
        )
        return [
            SettingRow("checkin_weekdays", ",".join(self.checkin_weekdays)),
            SettingRow("daily_job_time", self.daily_job_time),
            SettingRow("load_window_days", str(self.load_window_days)),
            SettingRow("weight_points", weight_str),
            SettingRow(
                "overdue_escalation_days", str(self.overdue_escalation_days)
            ),
            SettingRow("stale_days", str(self.stale_days)),
            SettingRow("request_reminder_days", str(self.request_reminder_days)),
            SettingRow("high_load_score", str(self.high_load_score)),
            SettingRow("high_load_consecutive", str(self.high_load_consecutive)),
            SettingRow("summary_channel_id", self.summary_channel_id),
            SettingRow("admin_channel_id", self.admin_channel_id),
            SettingRow("app_url", self.app_url),
            SettingRow("feature_ai_search", self.feature_ai_search),
            SettingRow(
                "rate_limit_ai_search_per_minute",
                str(self.rate_limit_ai_search_per_minute),
            ),
            SettingRow(
                "rate_limit_ai_search_per_day",
                str(self.rate_limit_ai_search_per_day),
            ),
            SettingRow("drive_ai_shared_folder_id", self.drive_ai_shared_folder_id),
            SettingRow("gemini_file_search_store_name", self.gemini_file_search_store_name),
            SettingRow("feature_drive_file_search", self.feature_drive_file_search),
        ]

