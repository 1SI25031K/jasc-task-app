"""Streamlit 画面共通のセッション状態管理と、タスク作成・編集・履歴表示 UI コンポーネント。"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import date, datetime, timedelta
import streamlit as st

from core.auth import require_authenticated_member
from core.i18n import (
    format_date,
    format_datetime,
    t,
    translate_assignment_status,
    translate_priority,
    translate_status,
    translate_weight,
)
from core.models import (
    JST,
    LangCode,
    Member,
    OptimisticLockError,
    Role,
    Task,
    TaskPriority,
    TaskStatus,
    TaskWeight,
)
from core.na_extractor import (
    DummyNaExtractor,
    GeminiNaExtractor,
    NaExtractor,
)
from core.notifier import DummyNotifier, Notifier, SlackNotifier
from core.repository import (
    InMemoryRepository,
    Repository,
    build_dummy_daily_snapshots,
)
from core.sheets_repository import SheetsRepository
from core.services import (
    apply_full_task_update,
    apply_quick_na_update,
    build_member_load_label,
    create_new_task,
    is_due_this_week,
    is_overdue_na,
    toggle_archive_task,
)

ALL_STATUSES: list[TaskStatus] = ["未着手", "進行中", "待ち", "完了"]
ALL_WEIGHTS: list[TaskWeight] = ["軽", "中", "重"]
ALL_PRIORITIES: list[TaskPriority] = ["高", "中", "低"]


def get_now() -> datetime:
    """現在日時（Asia/Tokyo）を返す。"""
    return datetime.now(JST)


def get_today() -> date:
    """本日の日付（Asia/Tokyo）を返す。"""
    return get_now().date()


def create_repository_from_config(
    secrets_dict: dict | None = None, today: date | None = None
) -> Repository:
    """secrets.toml（または引数辞書）の repository_backend 設定に応じて InMemory または SheetsRepository を返す。"""
    base_date = today or get_today()
    cfg = secrets_dict
    if cfg is None:
        try:
            cfg = dict(st.secrets)
        except Exception:
            cfg = {}

    import os

    backend = (
        os.environ.get("JASC_REPOSITORY_BACKEND", "").strip().lower()
        or str(cfg.get("repository_backend", "memory")).strip().lower()
    )
    if backend == "sheets":
        spreadsheet_id = str(cfg.get("spreadsheet_id", "")).strip()
        sa_info = cfg.get("gcp_service_account")
        if not spreadsheet_id or not isinstance(sa_info, Mapping):
            raise ValueError(
                "repository_backend='sheets' を使うには、secrets.toml の最上部（[gcp_service_account] より上の行）に spreadsheet_id を書き、続けて [gcp_service_account] セクションを設定してください。"
            )
        return SheetsRepository.from_service_account_info(
            service_account_info=dict(sa_info),
            spreadsheet_id=spreadsheet_id,
        )

    repo_inst = InMemoryRepository.create_with_dummy_data(today=base_date)
    repo_inst.save_daily_snapshots(
        build_dummy_daily_snapshots(
            today=base_date,
            members=repo_inst.list_members(),
            roles=repo_inst.list_roles(),
        )
    )
    return repo_inst


def create_notifier_from_config(secrets_dict: Mapping | None = None) -> Notifier:
    """secrets.toml に slack_bot_token（または [slack] bot_token）があれば SlackNotifier を、なければ DummyNotifier を返す。"""
    cfg = secrets_dict
    if cfg is None:
        try:
            cfg = dict(st.secrets)
        except Exception:
            cfg = {}

    token = str(cfg.get("slack_bot_token", "")).strip()
    if not token:
        slack_sec = cfg.get("slack")
        if isinstance(slack_sec, Mapping):
            token = str(slack_sec.get("bot_token", "")).strip()

    if token and not token.startswith("xoxb-your-"):
        return SlackNotifier(bot_token=token)
    return DummyNotifier()


def create_na_extractor_from_config(
    secrets_dict: Mapping | None = None,
) -> NaExtractor:
    """secrets.toml の na_extractor_backend / gemini_api_key / gemini_model に応じて GeminiNaExtractor または DummyNaExtractor を返す。"""
    cfg = secrets_dict
    if cfg is None:
        try:
            cfg = dict(st.secrets)
        except Exception:
            cfg = {}

    backend = str(cfg.get("na_extractor_backend", "")).strip().lower()
    api_key = str(cfg.get("gemini_api_key", "")).strip()
    model_name = str(cfg.get("gemini_model", "")).strip()

    gemini_sec = cfg.get("gemini")
    if isinstance(gemini_sec, Mapping):
        if not api_key:
            api_key = str(gemini_sec.get("api_key", "")).strip()
        if not model_name:
            model_name = str(gemini_sec.get("model", "")).strip()

    if backend == "dummy":
        return DummyNaExtractor()

    if backend == "gemini" or (
        api_key and not api_key.startswith("AIzaSy-your-")
    ):
        if not api_key or api_key.startswith("AIzaSy-your-"):
            raise ValueError(
                "na_extractor_backend='gemini' を使うには、secrets.toml に gemini_api_key を設定してください。"
            )
        if not model_name:
            raise ValueError(
                "Gemini を使うには、secrets.toml に gemini_model（例：'gemini-2.5-flash'）を設定してください。"
            )
        return GeminiNaExtractor(api_key=api_key, model_name=model_name)

    return DummyNaExtractor()


def init_session_state() -> None:
    """st.session_state にリポジトリ・通知・NA抽出器を初期化する（認証前に業務データは読み込まない：S1）。"""
    if "repo" not in st.session_state:
        st.session_state["repo"] = create_repository_from_config()
    if "notifier" not in st.session_state:
        st.session_state["notifier"] = create_notifier_from_config()
    if "na_extractor" not in st.session_state:
        st.session_state["na_extractor"] = create_na_extractor_from_config()


def get_repo() -> Repository:
    """セッション内の Repository インスタンスを取得する。"""
    init_session_state()
    return st.session_state["repo"]


def get_lang() -> LangCode:
    """現在の表示言語（'ja' または 'en'）を取得する。"""
    init_session_state()
    val = st.session_state.get(
        "topbar_lang_radio",
        st.session_state.get("lang_choice", st.session_state.get("lang", "ja")),
    )
    return "en" if val == "en" else "ja"


def get_current_member() -> Member:
    """現在ログイン中の認証済み Member を取得する（未認証・権限なしの場合は S1 ゲートにより停止する）。"""
    repo = get_repo()
    lang = get_lang()
    return require_authenticated_member(repo, lang=lang)


def format_status_badge(task: Task, today: date, lang: LangCode) -> str:
    """ステータスとアイコンを Markdown バッジで返す（赤は期限超過NAのみに限定）。"""
    status_label = translate_status(task.status, lang)
    status_icon_map = {
        "未着手": ":material/radio_button_unchecked:",
        "進行中": ":material/play_circle:",
        "待ち": ":material/hourglass_empty:",
        "完了": ":material/check_circle:",
    }
    icon = status_icon_map.get(task.status, "")
    badges = [f":gray-badge[{icon} {status_label}]"]

    if is_overdue_na(task, today):
        badges.append(
            f":red-badge[:material/error: {t('common.overdue_badge', lang)}]"
        )
    elif is_due_this_week(task, today):
        badges.append(
            f":gray-badge[:material/schedule: {t('common.due_this_week_badge', lang)}]"
        )

    if task.assignment_status == "依頼中":
        badges.append(
            f":gray-badge[:material/forward_to_inbox: {translate_assignment_status('依頼中', lang)}]"
        )
    elif task.assignment_status == "相談中":
        badges.append(
            f":gray-badge[:material/chat: {translate_assignment_status('相談中', lang)}]"
        )

    if task.archived:
        badges.append(
            f":gray-badge[:material/archive: {t('common.archived_badge', lang)}]"
        )

    return " ".join(badges)


def format_subjective_score_badge(
    score: int | None, is_fresh: bool, lang: LangCode
) -> str:
    """体感負荷（1〜7=グレー単色、8〜10=赤アラート）と数値を合わせて表示する。"""
    if score is None or not is_fresh:
        return f":gray-badge[:material/help_outline: {t('common.unanswered', lang)}]"
    if score <= 7:
        return f":gray-badge[:material/speed: {score} / 10]"
    return f":red-badge[:material/speed: {score} / 10]"


@st.dialog("タスク作成 / Create Task", width="large")
def open_create_task_dialog(default_role_id: str = "") -> None:
    """F7 新規タスク作成ダイアログを表示する。"""
    repo = get_repo()
    lang = get_lang()
    today = get_today()
    now = get_now()
    current_member = get_current_member()

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

    st.subheader(t("task_form.create_title", lang))

    title = st.text_input(t("task_form.field_title", lang), key="dlg_new_title")
    default_roles = (
        [default_role_id]
        if default_role_id and default_role_id in role_map
        else ([roles[0].role_id] if roles else [])
    )
    selected_roles = st.multiselect(
        t("task_form.field_roles", lang),
        options=[r.role_id for r in roles],
        default=default_roles,
        format_func=lambda rid: role_map[rid].get_name(lang),
        key="dlg_new_roles",
    )

    member_ids = [m.member_id for m in members]
    default_owner_idx = (
        member_ids.index(current_member.member_id)
        if current_member.member_id in member_ids
        else 0
    )
    selected_owner = st.selectbox(
        t("task_form.field_owner", lang),
        options=member_ids,
        index=default_owner_idx,
        format_func=lambda mid: owner_labels.get(mid, mid),
        key="dlg_new_owner",
    )

    # 自分以外を担当者にしたら「依頼」になることを保存前に画面で明示する（要件4・5.3）
    if selected_owner != current_member.member_id:
        owner_name = member_map[selected_owner].get_name(lang)
        st.info(
            t("task_form.request_notice_info", lang, owner_name=owner_name)
        )
    else:
        st.caption(t("task_form.self_assign_info", lang))

    col_w, col_p, col_s = st.columns(3)
    with col_w:
        weight = st.radio(
            t("task_form.field_weight", lang),
            options=ALL_WEIGHTS,
            index=1,
            format_func=lambda w: translate_weight(w, lang),
            horizontal=True,
            key="dlg_new_weight",
        )
    with col_p:
        priority = st.selectbox(
            t("task_form.field_priority", lang),
            options=ALL_PRIORITIES,
            index=1,
            format_func=lambda p: translate_priority(p, lang),
            key="dlg_new_priority",
        )
    with col_s:
        status = st.selectbox(
            t("task_form.field_status", lang),
            options=ALL_STATUSES,
            index=0,
            format_func=lambda s: translate_status(s, lang),
            key="dlg_new_status",
        )
    st.caption(t("weight.guide", lang))

    next_action = st.text_input(
        t("task_form.field_na", lang), key="dlg_new_na"
    )
    col_d1, col_d2 = st.columns(2)
    with col_d1:
        na_due = st.date_input(
            t("task_form.field_na_due", lang),
            value=today + timedelta(days=3),
            key="dlg_new_na_due",
        )
    with col_d2:
        enable_task_due = st.checkbox(
            t("task_form.field_enable_task_due", lang),
            value=False,
            key="dlg_new_enable_task_due",
        )
        task_due = (
            st.date_input(
                t("task_form.field_task_due", lang),
                value=today + timedelta(days=10),
                key="dlg_new_task_due",
            )
            if enable_task_due
            else None
        )

    waiting_on_id = ""
    if status == "待ち":
        wait_options = [""] + member_ids
        waiting_on_id = st.selectbox(
            t("task_form.field_waiting_on", lang),
            options=wait_options,
            format_func=lambda mid: (
                t("common.none", lang)
                if not mid
                else member_map[mid].get_name(lang)
            ),
            key="dlg_new_waiting_on",
        )
    blocker = st.text_input(
        t("task_form.field_blocker", lang), key="dlg_new_blocker"
    )
    st.caption(t("task_form.notes_privacy_warning", lang))
    notes = st.text_area(
        t("task_form.field_notes", lang), height=70, key="dlg_new_notes"
    )

    if st.button(
        t("common.save", lang), type="primary", width="stretch"
    ):
        if not title.strip() or not selected_roles or not next_action.strip():
            st.error(t("task_form.validation_error_required", lang))
            return
        try:
            new_task, logs = create_new_task(
                title=title,
                role_ids=selected_roles,
                owner_member_id=selected_owner,
                creator_member_id=current_member.member_id,
                weight=weight,
                next_action=next_action,
                na_due=na_due,
                task_due=task_due,
                status=status,
                waiting_on_member_id=waiting_on_id,
                priority=priority,
                blocker=blocker,
                notes=notes,
                now=now,
            )
            repo.add_task(new_task)
            for log in logs:
                repo.add_activity_log(log)
            st.toast(t("common.saved_toast", lang))
            st.rerun()
        except ValueError:
            st.error(t("common.general_error", lang))


def render_task_card(
    task: Task,
    roles: list[Role],
    members: list[Member],
    checkins: list,
    all_tasks: list[Task],
    key_prefix: str,
) -> None:
    """タスク1件を区切り線付きリスト行（Expander）として描画し、開くとクイック更新・詳細編集・履歴を表示する。"""
    repo = get_repo()
    lang = get_lang()
    today = get_today()
    now = get_now()
    current_member = get_current_member()
    settings = repo.get_settings()

    role_map = {r.role_id: r for r in roles}
    member_map = {m.member_id: m for m in members}
    owner = member_map.get(task.owner_member_id)
    owner_name = owner.get_name(lang) if owner else task.owner_member_id
    role_names = " / ".join(
        role_map[rid].get_name(lang) for rid in task.role_ids if rid in role_map
    )

    status_icon_map = {
        "未着手": ":material/radio_button_unchecked:",
        "進行中": ":material/play_circle:",
        "待ち": ":material/hourglass_empty:",
        "完了": ":material/check_circle:",
    }
    is_overdue = is_overdue_na(task, today)
    icon = (
        ":material/error:"
        if is_overdue
        else status_icon_map.get(task.status, ":material/task:")
    )

    due_str = format_date(task.na_due, lang)
    overdue_suffix = f"  ·  [{t('common.overdue_badge', lang)}]" if is_overdue else ""
    summary_label = f"{task.title}  —  {task.next_action} ({due_str}){overdue_suffix}"

    with st.expander(summary_label, icon=icon):
        # 1行目：バッジ・メタ情報
        badges_md = format_status_badge(task, today, lang)
        meta_parts = [
            f"**{t('common.role', lang)}**: {role_names}",
            f"**{t('common.owner', lang)}**: {owner_name}",
            f"**{t('common.weight', lang)}**: {translate_weight(task.weight, lang)}",
            f"**{t('common.due_date', lang)}**: {due_str}",
        ]
        if task.requested_by and task.requested_by in member_map:
            req_name = member_map[task.requested_by].get_name(lang)
            meta_parts.append(
                f"**{t('common.requested_by', lang)}**: {req_name}"
            )
        st.markdown(badges_md)
        st.caption(t("common.meta_separator", lang).join(meta_parts))

        if task.assignment_status == "相談中" and task.assignment_comment:
            st.caption(
                t(
                    "task_form.consult_comment_box",
                    lang,
                    comment=task.assignment_comment,
                )
            )

        tab_quick, tab_full = st.tabs(
            [t("task_form.tab_quick", lang), t("task_form.tab_full", lang)]
        )

        with tab_quick:
            # F8「NA を更新」簡易フォーム（2クリック以内で操作可能）
            q_col1, q_col2, q_col3, q_col4 = st.columns([3, 2, 2, 1.5])
            with q_col1:
                new_na = st.text_input(
                    t("common.next_action", lang),
                    value=task.next_action,
                    key=f"{key_prefix}_q_na_{task.task_id}",
                )
            with q_col2:
                new_na_due = st.date_input(
                    t("common.due_date", lang),
                    value=task.na_due,
                    key=f"{key_prefix}_q_due_{task.task_id}",
                )
            with q_col3:
                status_idx = (
                    ALL_STATUSES.index(task.status)
                    if task.status in ALL_STATUSES
                    else 0
                )
                new_status = st.selectbox(
                    t("common.status", lang),
                    options=ALL_STATUSES,
                    index=status_idx,
                    format_func=lambda s: translate_status(s, lang),
                    key=f"{key_prefix}_q_st_{task.task_id}",
                )
            with q_col4:
                st.write("")
                if st.button(
                    t("common.update_na_btn", lang),
                    key=f"{key_prefix}_q_btn_{task.task_id}",
                    type="primary",
                    width="stretch",
                ):
                    try:
                        updated_t, logs = apply_quick_na_update(
                            task=task,
                            next_action=new_na,
                            na_due=new_na_due,
                            status=new_status,
                            actor_member_id=current_member.member_id,
                            now=now,
                        )
                        repo.update_task(
                            updated_t, expected_updated_at=task.updated_at
                        )
                        for log in logs:
                            repo.add_activity_log(log)
                            st.toast(t("common.saved_toast", lang))
                        st.rerun()
                    except OptimisticLockError:
                        st.error(t("common.lock_error", lang))
                    except ValueError:
                        st.error(t("common.general_error", lang))

        with tab_full:
            # F8 全項目の編集・F9 アーカイブ/復元・F10 変更履歴
            owner_labels = {
                m.member_id: build_member_load_label(
                    m, all_tasks, checkins, today, lang, settings
                )
                for m in members
            }
            member_ids = [m.member_id for m in members]

            e_title = st.text_input(
                t("task_form.field_title", lang),
                value=task.title,
                key=f"{key_prefix}_e_title_{task.task_id}",
            )
            e_roles = st.multiselect(
                t("task_form.field_roles", lang),
                options=[r.role_id for r in roles],
                default=[rid for rid in task.role_ids if rid in role_map],
                format_func=lambda rid: role_map[rid].get_name(lang),
                key=f"{key_prefix}_e_roles_{task.task_id}",
            )
            owner_idx = (
                member_ids.index(task.owner_member_id)
                if task.owner_member_id in member_ids
                else 0
            )
            e_owner = st.selectbox(
                t("task_form.field_owner", lang),
                options=member_ids,
                index=owner_idx,
                format_func=lambda mid: owner_labels.get(mid, mid),
                key=f"{key_prefix}_e_owner_{task.task_id}",
            )
            if (
                e_owner != task.owner_member_id
                and e_owner != current_member.member_id
            ):
                st.caption(
                    t(
                        "task_form.request_notice_info",
                        lang,
                        owner_name=member_map[e_owner].get_name(lang),
                    )
                )

            c1, c2, c3 = st.columns(3)
            with c1:
                w_idx = (
                    ALL_WEIGHTS.index(task.weight)
                    if task.weight in ALL_WEIGHTS
                    else 1
                )
                e_weight = st.radio(
                    t("task_form.field_weight", lang),
                    options=ALL_WEIGHTS,
                    index=w_idx,
                    format_func=lambda w: translate_weight(w, lang),
                    horizontal=True,
                    key=f"{key_prefix}_e_weight_{task.task_id}",
                )
            with c2:
                p_idx = (
                    ALL_PRIORITIES.index(task.priority)
                    if task.priority in ALL_PRIORITIES
                    else 1
                )
                e_priority = st.selectbox(
                    t("task_form.field_priority", lang),
                    options=ALL_PRIORITIES,
                    index=p_idx,
                    format_func=lambda p: translate_priority(p, lang),
                    key=f"{key_prefix}_e_prio_{task.task_id}",
                )
            with c3:
                s_idx = (
                    ALL_STATUSES.index(task.status)
                    if task.status in ALL_STATUSES
                    else 0
                )
                e_status = st.selectbox(
                    t("task_form.field_status", lang),
                    options=ALL_STATUSES,
                    index=s_idx,
                    format_func=lambda s: translate_status(s, lang),
                    key=f"{key_prefix}_e_status_{task.task_id}",
                )
            st.caption(t("weight.guide", lang))

            e_na = st.text_input(
                t("task_form.field_na", lang),
                value=task.next_action,
                key=f"{key_prefix}_e_na_{task.task_id}",
            )
            d_col1, d_col2 = st.columns(2)
            with d_col1:
                e_na_due = st.date_input(
                    t("task_form.field_na_due", lang),
                    value=task.na_due,
                    key=f"{key_prefix}_e_na_due_{task.task_id}",
                )
            with d_col2:
                has_td = st.checkbox(
                    t("task_form.field_enable_task_due", lang),
                    value=task.task_due is not None,
                    key=f"{key_prefix}_e_has_td_{task.task_id}",
                )
                e_task_due = (
                    st.date_input(
                        t("task_form.field_task_due", lang),
                        value=task.task_due or (task.na_due + timedelta(days=7)),
                        key=f"{key_prefix}_e_td_{task.task_id}",
                    )
                    if has_td
                    else None
                )

            wait_opts = [""] + member_ids
            curr_wait_idx = (
                wait_opts.index(task.waiting_on_member_id)
                if task.waiting_on_member_id in wait_opts
                else 0
            )
            e_waiting = st.selectbox(
                t("task_form.field_waiting_on", lang),
                options=wait_opts,
                index=curr_wait_idx,
                format_func=lambda mid: (
                    t("common.none", lang)
                    if not mid
                    else member_map[mid].get_name(lang)
                ),
                key=f"{key_prefix}_e_wait_{task.task_id}",
            )
            e_blocker = st.text_input(
                t("task_form.field_blocker", lang),
                value=task.blocker,
                key=f"{key_prefix}_e_blocker_{task.task_id}",
            )
            st.caption(t("task_form.notes_privacy_warning", lang))
            e_notes = st.text_area(
                t("task_form.field_notes", lang),
                value=task.notes,
                height=65,
                key=f"{key_prefix}_e_notes_{task.task_id}",
            )

            btn_col1, btn_col2, btn_col3 = st.columns(3)
            with btn_col1:
                if st.button(
                    t("common.save", lang),
                    key=f"{key_prefix}_e_save_{task.task_id}",
                    type="primary",
                    width="stretch",
                ):
                    try:
                        updated_t, logs = apply_full_task_update(
                            task=task,
                            title=e_title,
                            role_ids=e_roles,
                            owner_member_id=e_owner,
                            weight=e_weight,
                            next_action=e_na,
                            na_due=e_na_due,
                            task_due=e_task_due,
                            status=e_status,
                            waiting_on_member_id=e_waiting,
                            priority=e_priority,
                            blocker=e_blocker,
                            notes=e_notes,
                            actor_member_id=current_member.member_id,
                            now=now,
                        )
                        repo.update_task(
                            updated_t, expected_updated_at=task.updated_at
                        )
                        for log in logs:
                            repo.add_activity_log(log)
                        st.toast(t("common.saved_toast", lang))
                        st.rerun()
                    except OptimisticLockError:
                        st.error(t("common.lock_error", lang))
                    except ValueError:
                        st.error(t("common.general_error", lang))

            with btn_col2:
                if task.assignment_status == "相談中":
                    if st.button(
                        t("task_form.rerequest_btn", lang),
                        key=f"{key_prefix}_e_rereq_{task.task_id}",
                        width="stretch",
                    ):
                        try:
                            updated_t, logs = apply_full_task_update(
                                task=task,
                                title=e_title,
                                role_ids=e_roles,
                                owner_member_id=e_owner,
                                weight=e_weight,
                                next_action=e_na,
                                na_due=e_na_due,
                                task_due=e_task_due,
                                status=e_status,
                                waiting_on_member_id=e_waiting,
                                priority=e_priority,
                                blocker=e_blocker,
                                notes=e_notes,
                                actor_member_id=current_member.member_id,
                                now=now,
                                force_rerequest=True,
                            )
                            repo.update_task(
                                updated_t, expected_updated_at=task.updated_at
                            )
                            for log in logs:
                                repo.add_activity_log(log)
                            st.toast(t("common.saved_toast", lang))
                            st.rerun()
                        except OptimisticLockError:
                            st.error(t("common.lock_error", lang))
                        except ValueError:
                            st.error(t("common.general_error", lang))

            with btn_col3:
                # F9 アーカイブ／復元
                if not task.archived:
                    if st.button(
                        f":material/archive: {t('common.archive_btn', lang)}",
                        key=f"{key_prefix}_e_arch_{task.task_id}",
                        width="stretch",
                    ):
                        try:
                            arch_t, log = toggle_archive_task(
                                task,
                                archived=True,
                                actor_member_id=current_member.member_id,
                                now=now,
                            )
                            repo.update_task(
                                arch_t, expected_updated_at=task.updated_at
                            )
                            repo.add_activity_log(log)
                            st.toast(t("common.archived_toast", lang))
                            st.rerun()
                        except OptimisticLockError:
                            st.error(t("common.lock_error", lang))
                        except ValueError:
                            st.error(t("common.general_error", lang))
                else:
                    if st.button(
                        f":material/unarchive: {t('common.restore_btn', lang)}",
                        key=f"{key_prefix}_e_rest_{task.task_id}",
                        width="stretch",
                    ):
                        try:
                            rest_t, log = toggle_archive_task(
                                task,
                                archived=False,
                                actor_member_id=current_member.member_id,
                                now=now,
                            )
                            repo.update_task(
                                rest_t, expected_updated_at=task.updated_at
                            )
                            repo.add_activity_log(log)
                            st.toast(t("common.restored_toast", lang))
                            st.rerun()
                        except OptimisticLockError:
                            st.error(t("common.lock_error", lang))
                        except ValueError:
                            st.error(t("common.general_error", lang))

            # F10 変更履歴の表示
            st.divider()
            logs = repo.list_activity_logs(task_id=task.task_id)
            st.markdown(f"**{t('task_form.history_section', lang, count=len(logs))}**")
            if not logs:
                st.caption(t("task_form.no_history", lang))
            else:
                for log in sorted(
                    logs, key=lambda x: x.timestamp, reverse=True
                ):
                    actor = member_map.get(log.member_id)
                    actor_name = (
                        actor.get_name(lang) if actor else log.member_id
                    )
                    detail = (
                        f" ({log.field}: {log.old_value} → {log.new_value})"
                        if log.field
                        else ""
                    )
                    bullet = "• " if lang == "en" else "・"
                    sep = t("common.meta_separator", lang)
                    st.caption(
                        f"{bullet}{format_datetime(log.timestamp, lang)}{sep}{actor_name}{sep}`{log.action}`{detail}"
                    )
            if not logs:
                st.caption(t("task_form.no_history", lang))
            else:
                for log in sorted(
                    logs, key=lambda x: x.timestamp, reverse=True
                ):
                    actor = member_map.get(log.member_id)
                    actor_name = (
                        actor.get_name(lang) if actor else log.member_id
                    )
                    detail = (
                        f" ({log.field}: {log.old_value} → {log.new_value})"
                        if log.field
                        else ""
                    )
                    bullet = "• " if lang == "en" else "・"
                    sep = t("common.meta_separator", lang)
                    st.caption(
                        f"{bullet}{format_datetime(log.timestamp, lang)}{sep}{actor_name}{sep}`{log.action}`{detail}"
                    )
