"""F14：NA 生成画面。議事メモを貼り付け → 候補抽出 → 確認・修正 → チェックした行だけ登録する。"""

from __future__ import annotations

from datetime import timedelta
import uuid
import streamlit as st

from core.i18n import t, translate_weight
from core.models import Meeting
from core.na_extractor import (
    MinutesTooLongError,
    NaCandidate,
    NaExtractor,
    RateLimitExceededError,
    check_and_record_rate_limit,
    is_candidate_ready_to_save,
)
from core.services import build_member_load_label, create_new_task
from core.session import (
    ALL_WEIGHTS,
    get_current_member,
    get_lang,
    get_now,
    get_repo,
    get_today,
)
from core.ui.loading import m3_loading_indicator

repo = get_repo()
lang = get_lang()
today = get_today()
now = get_now()
current_member = get_current_member()
extractor: NaExtractor = st.session_state["na_extractor"]

roles = repo.list_roles(active_only=True)
members = repo.list_members(active_only=True)
tasks = repo.list_tasks(include_archived=False)
checkins = repo.list_checkins()
settings = repo.get_settings()

role_map = {r.role_id: r for r in roles}
member_map = {m.member_id: m for m in members}
owner_labels = {
    m.member_id: build_member_load_label(
        m, tasks, checkins, today, lang, settings
    )
    for m in members
}

st.title(f":material/edit_note: {t('minutes.title', lang)}")

# 注意書き（5.7・S9：「個人情報は貼り付けないでください」）
st.warning(t("minutes.privacy_warning", lang))

col_m1, col_m2 = st.columns([1, 2])
with col_m1:
    meeting_date = st.date_input(
        t("minutes.meeting_date_label", lang),
        value=today,
        key="minutes_meeting_date",
    )
with col_m2:
    meeting_title = st.text_input(
        t("minutes.meeting_title_label", lang),
        value=t("minutes.default_meeting_title", lang),
        key="minutes_meeting_title",
    )

sample_default_text = t("minutes.sample_text", lang)
minutes_text = st.text_area(
    t("minutes.minutes_text_label", lang),
    value=st.session_state.get("minutes_raw_text", sample_default_text),
    height=150,
    key="minutes_text_area",
)
st.session_state["minutes_raw_text"] = minutes_text

if st.button(
    t("minutes.extract_btn", lang),
    type="primary",
    key="minutes_extract_btn",
):
    try:
        # S13：1ユーザーあたり1分に3回までのレート制限（連打防止）
        call_history = list(st.session_state.get("na_extract_timestamps", []))
        updated_history = check_and_record_rate_limit(call_history, now=now)
        st.session_state["na_extract_timestamps"] = updated_history

        loading_text = (
            "AI が議事メモから NA 候補を生成中…"
            if lang == "ja"
            else "Generating NA candidates from meeting minutes…"
        )
        with m3_loading_indicator(text=loading_text):
            candidates = extractor.extract(
                raw_minutes=minutes_text,
                meeting_date=meeting_date,
                roles=roles,
                members=members,
            )
        st.session_state["extracted_na_candidates"] = candidates
    except RateLimitExceededError:
        st.error(t("minutes.rate_limit_error", lang))
    except MinutesTooLongError:
        st.error(t("minutes.too_long_error", lang))
    except Exception:
        # 5.7：API エラー時は「時間をおいて再試行してください」と表示し、入力したメモは画面残す
        st.error(t("minutes.extract_error_retry", lang))

candidates_list: list[NaCandidate] = st.session_state.get(
    "extracted_na_candidates", []
)

if candidates_list:
    st.divider()
    st.subheader(t("minutes.candidates_section", lang))

    edited_candidates: list[tuple[bool, NaCandidate]] = []
    member_options = [""] + [m.member_id for m in members]
    role_options = [r.role_id for r in roles]

    for idx, cand in enumerate(candidates_list):
        with st.container(border=True):
            include_row = st.checkbox(
                f"**#{idx + 1}** — {t('minutes.include_checkbox', lang)}",
                value=True,
                key=f"cand_inc_{idx}",
            )
            if cand.evidence:
                st.caption(
                    t("minutes.evidence_label", lang, evidence=cand.evidence)
                )

            c_title = st.text_input(
                t("task_form.field_title", lang),
                value=cand.title,
                key=f"cand_title_{idx}",
            )
            c_na = st.text_input(
                t("task_form.field_na", lang),
                value=cand.next_action,
                key=f"cand_na_{idx}",
            )

            r_col1, r_col2, r_col3, r_col4 = st.columns([2, 2, 1.2, 1.5])
            with r_col1:
                c_roles = st.multiselect(
                    t("task_form.field_roles", lang),
                    options=role_options,
                    default=[
                        rid for rid in cand.role_ids if rid in role_map
                    ],
                    format_func=lambda rid: role_map[rid].get_name(lang),
                    key=f"cand_roles_{idx}",
                )
            with r_col2:
                owner_idx = (
                    member_options.index(cand.owner_member_id)
                    if cand.owner_member_id in member_options
                    else 0
                )
                c_owner = st.selectbox(
                    t("task_form.field_owner", lang),
                    options=member_options,
                    index=owner_idx,
                    format_func=lambda mid: (
                        f":material/warning: {t('common.unassigned', lang)}"
                        if not mid
                        else owner_labels.get(mid, mid)
                    ),
                    key=f"cand_owner_{idx}",
                )
            with r_col3:
                w_idx = (
                    ALL_WEIGHTS.index(cand.weight)
                    if cand.weight in ALL_WEIGHTS
                    else 1
                )
                c_weight = st.selectbox(
                    t("task_form.field_weight", lang),
                    options=ALL_WEIGHTS,
                    index=w_idx,
                    format_func=lambda w: translate_weight(w, lang),
                    key=f"cand_weight_{idx}",
                )
            with r_col4:
                has_due = st.checkbox(
                    t("common.due_date", lang),
                    value=cand.na_due is not None,
                    key=f"cand_has_due_{idx}",
                )
                c_due = (
                    st.date_input(
                        t("task_form.field_na_due", lang),
                        value=cand.na_due or (today + timedelta(days=5)),
                        key=f"cand_due_{idx}",
                        label_visibility="collapsed",
                    )
                    if has_due
                    else None
                )

            if c_owner and c_owner != current_member.member_id:
                st.info(
                    t(
                        "task_form.request_notice_info",
                        lang,
                        owner_name=member_map[c_owner].get_name(lang),
                    )
                )

            updated_cand = NaCandidate(
                title=c_title,
                next_action=c_na,
                owner_member_id=c_owner,
                role_ids=c_roles,
                na_due=c_due,
                weight=c_weight,
                evidence=cand.evidence,
            )
            edited_candidates.append((include_row, updated_cand))

    selected_Only = [c for inc, c in edited_candidates if inc]
    any_incomplete = any(
        not is_candidate_ready_to_save(c) for c in selected_Only
    )
    if any_incomplete:
        st.warning(t("minutes.missing_required_warning", lang))

    if st.button(
        t("minutes.save_selected_btn", lang),
        type="primary",
        disabled=(not selected_Only or any_incomplete),
        width="stretch",
        key="minutes_save_all_btn",
    ):
        meeting_id = f"mtg_{uuid.uuid4().hex[:6]}"
        for cand in selected_Only:
            assert cand.na_due is not None
            new_task, logs = create_new_task(
                title=cand.title,
                role_ids=cand.role_ids,
                owner_member_id=cand.owner_member_id,
                creator_member_id=current_member.member_id,
                weight=cand.weight,
                next_action=cand.next_action,
                na_due=cand.na_due,
                now=now,
                source="minutes",
                meeting_id=meeting_id,
            )
            repo.add_task(new_task)
            for log in logs:
                repo.add_activity_log(log)

        repo.add_meeting(
            Meeting(
                meeting_id=meeting_id,
                meeting_date=meeting_date,
                title=meeting_title.strip() or "定例会",
                created_by=current_member.member_id,
                created_at=now,
                generated_count=len(candidates_list),
                saved_count=len(selected_Only),
            )
        )
        st.session_state["extracted_na_candidates"] = []
        st.toast(
            t("minutes.saved_count_toast", lang, count=len(selected_Only))
        )
        st.switch_page("pages/all_tasks.py")
