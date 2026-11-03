"""F16：体感負荷チェックイン画面。1〜10のボタンを1回押すだけで回答でき、自動負荷と前回の回答も表示する。"""

from __future__ import annotations

import uuid
import streamlit as st

from core.i18n import format_date, t
from core.load import calc_member_auto_load
from core.models import Checkin
from core.session import (
    format_subjective_score_badge,
    get_current_member,
    get_lang,
    get_repo,
    get_today,
)

repo = get_repo()
lang = get_lang()
today = get_today()
current_member = get_current_member()

tasks = repo.list_tasks(include_archived=False)
settings = repo.get_settings()

st.title(f"💚 {t('checkin.title', lang)}（{current_member.get_name(lang)}）")
st.markdown(t("checkin.subtitle", lang))

# 注意書き（4.5・S9：「体調などの詳しい理由は書かなくて大丈夫です（全員が閲覧できます）」）
st.caption(t("checkin.privacy_notice", lang))
comment_input = st.text_input(
    t("checkin.comment_label", lang),
    max_chars=100,
    key="checkin_comment_input",
)

st.subheader(t("checkin.tap_instruction", lang))


def _submit_score(score_val: int) -> None:
    """スコア1〜10を保存（同日なら上書き）し、結果フィードバックを記録する。"""
    member_history = repo.list_checkins(member_id=current_member.member_id)
    prev_Checkin = next(
        (c for c in reversed(member_history) if c.date < today), None
    )
    auto_pt = calc_member_auto_load(
        current_member.member_id, tasks, today, settings
    )
    new_c = Checkin(
        checkin_id=f"c_{uuid.uuid4().hex[:6]}",
        member_id=current_member.member_id,
        date=today,
        score=score_val,
        comment=comment_input.strip()[:100],
        auto_load_at_checkin=auto_pt,
    )
    repo.save_checkin(new_c)
    st.session_state["last_checkin_feedback"] = {
        "score": score_val,
        "prev_score": prev_Checkin.score if prev_Checkin else None,
        "auto_pt": auto_pt,
    }
    st.toast(t("checkin.saved_message", lang, score=score_val))


# 1〜4（緑）、5〜7（黄）、8〜10（赤）の3グループで1クリックボタンを配置（6.3）
with st.container(border=True):
    st.markdown(f"**{t('checkin.group_low', lang)}**")
    c_low = st.columns(4)
    for idx, val in enumerate([1, 2, 3, 4]):
        with c_low[idx]:
            if st.button(
                f"🟢 {val}",
                key=f"checkin_btn_{val}",
                use_container_width=True,
            ):
                _submit_score(val)

with st.container(border=True):
    st.markdown(f"**{t('checkin.group_mid', lang)}**")
    c_mid = st.columns(3)
    for idx, val in enumerate([5, 6, 7]):
        with c_mid[idx]:
            if st.button(
                f"🟡 {val}",
                key=f"checkin_btn_{val}",
                use_container_width=True,
            ):
                _submit_score(val)

with st.container(border=True):
    st.markdown(f"**{t('checkin.group_high', lang)}**")
    c_high = st.columns(3)
    for idx, val in enumerate([8, 9, 10]):
        with c_high[idx]:
            if st.button(
                f"🔴 {val}",
                key=f"checkin_btn_{val}",
                use_container_width=True,
            ):
                _submit_score(val)

# 回答後のフィードバック表示（F16：自分の自動負荷と前回の回答も表示）
feedback = st.session_state.get("last_checkin_feedback")
if feedback:
    prev_label = (
        str(feedback["prev_score"])
        if feedback["prev_score"] is not None
        else t("common.none", lang)
    )
    st.success(
        f"{t('checkin.saved_message', lang, score=feedback['score'])}\n\n"
        f"{t('checkin.feedback_summary', lang, current=feedback['score'], prev=prev_label, auto_pt=feedback['auto_pt'])}"
    )

st.divider()
st.subheader(f"🕒 {t('checkin.recent_history_title', lang)}")
history = list(
    reversed(repo.list_checkins(member_id=current_member.member_id))
)
for item in history[:6]:
    badge = format_subjective_score_badge(item.score, True, lang)
    note_str = f" — 💬 {item.comment}" if item.comment else ""
    st.markdown(
        f"・**{format_date(item.date, lang)}**: {badge} "
        f"（{t('common.auto_load_short', lang, pt=item.auto_load_at_checkin)}）{note_str}"
    )
