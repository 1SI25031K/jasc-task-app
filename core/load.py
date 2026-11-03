"""5.4 負荷の計算ルール（自動負荷・1〜10換算・ずれ判定・体感負荷アラート）。"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Iterable

from core.models import Checkin, Member, RoleAssignment, Task
from core.settings import AppSettings, DEFAULT_WEIGHT_POINTS


@dataclass
class AutoLoadBreakdown:
    """メンバーの自動負荷ポイントの内訳（余力マップでの色分け表示用 5.3・5.4）。"""

    member_id: str
    accepted_points: int
    pending_points: int

    @property
    def total_points(self) -> int:
        """承諾済と依頼中・相談中の合計ポイントを返す。"""
        return self.accepted_points + self.pending_points


def is_task_in_load_window(
    task: Task, today: date, load_window_days: int = 14
) -> bool:
    """タスクが自動負荷の計算対象かどうかを判定する（5.4）。

    条件：
    - status != '完了'
    - archived == False
    - NA 期限が今日から load_window_days 日以内（na_due <= today + load_window_days）
      ※期限切れ（na_due < today）もここに含まれる。
    - 依頼中・相談中のタスクも含める（5.3）。
    """
    if task.archived or task.status == "完了":
        return False
    window_end = today + timedelta(days=load_window_days)
    return task.na_due <= window_end


def calc_member_auto_load_breakdown(
    member_id: str,
    tasks: Iterable[Task],
    today: date,
    settings: AppSettings | None = None,
) -> AutoLoadBreakdown:
    """指定メンバーの自動負荷ポイント内訳（承諾済 / 依頼中・相談中）を計算する（5.3・5.4）。"""
    cfg = settings or AppSettings()
    weight_map = cfg.weight_points or DEFAULT_WEIGHT_POINTS

    accepted_pt = 0
    pending_pt = 0
    for task in tasks:
        if task.owner_member_id != member_id:
            continue
        if not is_task_in_load_window(task, today, cfg.load_window_days):
            continue
        pt = weight_map.get(task.weight, DEFAULT_WEIGHT_POINTS.get("中", 2))
        if task.assignment_status == "承諾済":
            accepted_pt += pt
        else:
            pending_pt += pt

    return AutoLoadBreakdown(
        member_id=member_id,
        accepted_points=accepted_pt,
        pending_points=pending_pt,
    )


def calc_member_auto_load(
    member_id: str,
    tasks: Iterable[Task],
    today: date,
    settings: AppSettings | None = None,
) -> int:
    """指定メンバーの自動負荷（合計ポイント）を計算する（5.4）。"""
    return calc_member_auto_load_breakdown(
        member_id=member_id,
        tasks=tasks,
        today=today,
        settings=settings,
    ).total_points


def calc_all_members_auto_load(
    members: Iterable[Member],
    tasks: Iterable[Task],
    today: date,
    settings: AppSettings | None = None,
) -> dict[str, int]:
    """active な全メンバーの自動負荷（member_id -> pt）を計算する。"""
    task_list = list(tasks)
    return {
        m.member_id: calc_member_auto_load(
            m.member_id, task_list, today, settings
        )
        for m in members
        if m.active
    }


def scale_auto_loads_to_10(auto_loads: dict[str, int]) -> dict[str, int]:
    """全メンバーの自動負荷を 1〜10 に換算する（メンバー内の最大値を10とする 5.4）。

    - 全員の最大値が 0 の場合は全員 1 とする。
    - 最大値 > 0 の場合は round(pt / max_pt * 10) を計算し、1〜10 の範囲に収める（0ptは1）。
    """
    if not auto_loads:
        return {}
    max_pt = max(auto_loads.values())
    if max_pt <= 0:
        return {m_id: 1 for m_id in auto_loads}

    scaled: dict[str, int] = {}
    for m_id, pt in auto_loads.items():
        if pt <= 0:
            scaled[m_id] = 1
        else:
            val = round((pt / max_pt) * 10)
            scaled[m_id] = max(1, min(10, val))
    return scaled


def get_latest_checkin(
    member_id: str,
    checkins: Iterable[Checkin],
    today: date | None = None,
) -> tuple[Checkin | None, bool]:
    """指定メンバーの最新の体感負荷 Checkin と、有効かどうか（7日以内か）を返す（5.4）。

    戻り値: (最新のCheckin または None, is_fresh)
    - 最後の回答から7日以上経っていたら（today - latest.date >= 7日）、is_fresh=False（「未回答」扱い）。
    """
    member_checkins = [c for c in checkins if c.member_id == member_id]
    if not member_checkins:
        return None, False
    latest = max(member_checkins, key=lambda c: (c.date, c.checkin_id))
    if today is None:
        return latest, True
    is_fresh = (today - latest.date) < timedelta(days=7)
    return latest, is_fresh


def has_load_gap(
    scaled_auto_load: int,
    subjective_score: int | None,
    gap_threshold: int = 4,
) -> bool:
    """1〜10換算した自動負荷と体感負荷の差が gap_threshold（既定4）以上かを判定する（5.4）。"""
    if subjective_score is None:
        return False
    return abs(scaled_auto_load - subjective_score) >= gap_threshold


@dataclass
class HighLoadAlertResult:
    """体感負荷アラートの判定結果（5.4）。"""

    member_id: str
    is_alert: bool
    recent_scores: list[int]
    notify_leader_ids: list[str]


def check_high_load_alert(
    member_id: str,
    checkins: Iterable[Checkin],
    role_assignments: Iterable[RoleAssignment] | None = None,
    settings: AppSettings | None = None,
) -> HighLoadAlertResult:
    """体感負荷が high_load_score 以上の回答が high_load_consecutive 回続いたかを判定する（5.4）。

    アラート対象の場合、実行委員長（r_chair）・副実行委員長（r_vice_chair）の担当メンバーIDを抽出する。
    """
    cfg = settings or AppSettings()
    member_checkins = sorted(
        (c for c in checkins if c.member_id == member_id),
        key=lambda c: (c.date, c.checkin_id),
    )
    n = cfg.high_load_consecutive
    if len(member_checkins) < n:
        return HighLoadAlertResult(
            member_id=member_id,
            is_alert=False,
            recent_scores=[c.score for c in member_checkins],
            notify_leader_ids=[],
        )

    recent = member_checkins[-n:]
    recent_scores = [c.score for c in recent]
    is_alert = all(score >= cfg.high_load_score for score in recent_scores)

    leader_ids: list[str] = []
    if is_alert and role_assignments is not None:
        for ra in role_assignments:
            if ra.role_id in ("r_chair", "r_vice_chair") and ra.kind in (
                "責任者",
                "担当",
            ):
                if ra.member_id not in leader_ids:
                    leader_ids.append(ra.member_id)

    return HighLoadAlertResult(
        member_id=member_id,
        is_alert=is_alert,
        recent_scores=recent_scores,
        notify_leader_ids=leader_ids,
    )

