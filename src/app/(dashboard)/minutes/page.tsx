"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useDashboard } from "@/context/DashboardContext";
import { useSnackbar } from "@/context/SnackbarContext";
import { getTodayJST } from "@/lib/time";
import { calcMemberAutoLoad, getLatestCheckin } from "@/lib/services";
import { extractNaAction, saveExtractedTasksAction } from "@/app/actions/minutes";
import { NaCandidate, isCandidateReadyToSave } from "@/lib/gemini";
import { MaterialIcon } from "@/components/MaterialIcon";

export default function MinutesPage() {
  const router = useRouter();
  const { data, currentMember, lang, t, refresh } = useDashboard();
  const { showSnackbar } = useSnackbar();
  const today = getTodayJST();

  const [meetingDate, setMeetingDate] = useState(today);
  const [meetingTitle, setMeetingTitle] = useState(
    t("minutes.default_meeting_title") || "第5回 定例会"
  );
  const [minutesText, setMinutesText] = useState(
    t("minutes.sample_text") ||
      "・次回定例会までにスライドのたたき台を作成して共有フォルダに置く。\n・会場の空き状況について候補施設に問い合わせる。"
  );

  const [candidates, setCandidates] = useState<
    Array<{
      included: boolean;
      data: NaCandidate;
    }>
  >([]);

  const [isExtracting, startExtractTransition] = useTransition();
  const [isSaving, startSaveTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // メンバー表示用ラベル（自動負荷・体感負荷を含む）
  const getMemberLabel = (memberId: string) => {
    const m = data.members.find((mem) => mem.memberId === memberId);
    if (!m) return memberId;
    const autoPt = calcMemberAutoLoad(m.memberId, data.tasks, today);
    const { checkin } = getLatestCheckin(m.memberId, data.checkins, today);
    const subjStr = checkin ? `${checkin.score}` : "-";
    return `${m.displayName}（自動 ${autoPt}pt ／ 体感 ${subjStr}）`;
  };

  const handleExtract = () => {
    setErrorMessage(null);
    startExtractTransition(async () => {
      try {
        const res = await extractNaAction(minutesText, meetingDate);
        if (res.success && res.candidates) {
          if (res.candidates.length === 0) {
            setErrorMessage(
              lang === "en"
                ? "No tasks or next actions found in the minutes."
                : "議事メモからタスクやNA候補が見つかりませんでした。"
            );
            setCandidates([]);
          } else {
            setCandidates(
              res.candidates.map((c) => ({
                included: isCandidateReadyToSave(c),
                data: { ...c },
              }))
            );
          }
        } else {
          setErrorMessage(res.error || t("minutes.extract_error_retry"));
        }
      } catch (err: any) {
        setErrorMessage(err.message || t("minutes.extract_error_retry"));
      }
    });
  };

  const updateCandidate = (index: number, updates: Partial<NaCandidate>) => {
    setCandidates((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        data: {
          ...next[index].data,
          ...updates,
        },
      };
      return next;
    });
  };

  const toggleInclude = (index: number) => {
    setCandidates((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        included: !next[index].included,
      };
      return next;
    });
  };

  const selectedCandidates = candidates
    .filter((c) => c.included)
    .map((c) => c.data);

  const anyIncompleteSelected = selectedCandidates.some(
    (c) => !isCandidateReadyToSave(c)
  );

  const handleSaveAll = () => {
    if (selectedCandidates.length === 0) return;
    if (anyIncompleteSelected) {
      setErrorMessage(
        t("minutes.missing_required_warning").replace(":material/warning: ", "")
      );
      return;
    }

    setErrorMessage(null);
    startSaveTransition(async () => {
      try {
        const res = await saveExtractedTasksAction({
          meetingDate,
          meetingTitle,
          totalGenerated: candidates.length,
          candidates: selectedCandidates,
        });

        if (res.success && res.savedCount) {
          showSnackbar({
            message: t("minutes.saved_count_toast", { count: res.savedCount }),
          });
          await refresh();
          setCandidates([]);
          setTimeout(() => {
            router.push("/all-tasks");
          }, 1500);
        } else {
          setErrorMessage(res.error || "タスクの一括登録に失敗しました。");
        }
      } catch (err: any) {
        setErrorMessage(err.message || "タスクの一括登録に失敗しました。");
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* ページヘッダー */}
      <div>
        <div className="flex items-center gap-2">
          <MaterialIcon name="auto_awesome" className="text-2xl text-primary" />
          <h1 className="text-2xl font-normal tracking-tight text-on-surface">
            {t("minutes.title")}
          </h1>
        </div>
        <p className="mt-1 text-xs text-on-surface-variant">{t("minutes.ai_note")}</p>
      </div>

      {/* 注意書きバナー（S12 / M3 Outlined Banner） */}
      <div className="flex items-start gap-2.5 rounded-[16px] bg-surface-container-high p-3.5 text-xs text-on-surface-variant">
        <MaterialIcon name="warning" className="text-base text-secondary shrink-0 mt-0.5" />
        <p>{t("minutes.privacy_warning").replace(":material/warning: ", "")}</p>
      </div>

      {/* エラー表示 */}
      {errorMessage && (
        <div className="flex items-center gap-2.5 rounded-[28px] bg-error-container p-4 text-xs font-medium text-on-error-container">
          <MaterialIcon name="error_outline" className="text-base text-error shrink-0" />
          <p>{errorMessage}</p>
        </div>
      )}

      {/* 議事メモ入力フォーム（Level 0 flat, radius 28px, 枠線なし / AI解析中は流れるグラデーション境界光） */}
      <div
        className={`rounded-[28px] bg-surface-container-lowest p-6 border-none shadow-none transition-all ${
          isExtracting ? "m3-ai-border-flow" : ""
        }`}
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1.5">
              {t("minutes.meeting_date_label")}
            </label>
            <input
              type="date"
              value={meetingDate}
              onChange={(e) => setMeetingDate(e.target.value)}
              className="w-full h-10 rounded-[8px] border border-outline-variant bg-surface-container-low px-3 text-xs text-on-surface focus:border-primary focus:bg-surface-container-lowest focus:outline-none"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-on-surface-variant mb-1.5">
              {t("minutes.meeting_title_label")}
            </label>
            <input
              type="text"
              value={meetingTitle}
              onChange={(e) => setMeetingTitle(e.target.value)}
              placeholder="例：第5回 定例会"
              className="w-full h-10 rounded-[8px] border border-outline-variant bg-surface-container-low px-3 text-xs text-on-surface focus:border-primary focus:bg-surface-container-lowest focus:outline-none"
            />
          </div>
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-on-surface-variant">
              {t("minutes.minutes_text_label")}
            </label>
            <span className="text-[10px] text-on-surface-variant">
              {minutesText.length} / 20,000
            </span>
          </div>
          <textarea
            rows={7}
            value={minutesText}
            onChange={(e) => setMinutesText(e.target.value)}
            placeholder={t("minutes.minutes_text_placeholder")}
            className="w-full rounded-[12px] border border-outline-variant bg-surface-container-low p-3 text-xs text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:bg-surface-container-lowest focus:outline-none font-sans leading-relaxed"
          />
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            disabled={isExtracting || !minutesText.trim()}
            onClick={handleExtract}
            className="inline-flex items-center gap-2 h-10 rounded-full bg-primary px-5 text-xs font-medium text-on-primary hover:bg-primary/90 disabled:opacity-50 transition m3-interactive"
          >
            {isExtracting ? (
              <>
                <MaterialIcon name="auto_awesome" className="text-base animate-pulse" />
                <span>
                  {lang === "en" ? "Extracting NAs..." : "AI が解析中..."}
                </span>
              </>
            ) : (
              <>
                <MaterialIcon name="auto_awesome" className="text-base" />
                <span>
                  {t("minutes.extract_btn").replace(":material/add_task: ", "")}
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* AI 解析中表示（Google Workspace AI 風グラデーションテキスト＆スケルトン3行） */}
      {isExtracting && (
        <div className="space-y-4">
          <div className="rounded-[28px] bg-surface-container-lowest p-5 flex flex-col items-center justify-center text-center">
            <div className="flex items-center gap-2 mb-1">
              <MaterialIcon name="auto_awesome" className="text-xl text-primary animate-pulse" />
              <span className="m3-ai-shimmer-text text-sm font-medium">
                {lang === "en" ? "Generating NA candidates..." : "NA の候補を作成しています..."}
              </span>
            </div>
            <p className="text-[11px] text-on-surface-variant">
              {lang === "en"
                ? "AI generates suggestions. Please review and verify before saving."
                : "AI が候補を作ります。内容を確認してから登録してください。"}
            </p>
          </div>

          {/* スケルトン行（3行） */}
          <div className="space-y-3">
            {[1, 2, 3].map((idx) => (
              <div
                key={idx}
                className="rounded-[28px] bg-surface-container-lowest p-5 space-y-3"
              >
                <div className="flex items-center justify-between pb-3 border-b border-outline-variant/10">
                  <div className="h-4 w-32 rounded-full m3-shimmer" />
                  <div className="h-3 w-48 rounded-full m3-shimmer" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="h-9 rounded-[8px] m3-shimmer" />
                  <div className="h-9 rounded-[8px] m3-shimmer" />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="h-9 rounded-[8px] m3-shimmer" />
                  <div className="h-9 rounded-[8px] m3-shimmer" />
                  <div className="h-9 rounded-[8px] m3-shimmer" />
                  <div className="h-9 rounded-[8px] m3-shimmer" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 抽出された NA 候補リスト（到着時にスタッガード表示） */}
      {!isExtracting && candidates.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-normal text-on-surface">
              {t("minutes.candidates_section")} ({candidates.length}件)
            </h2>
            <div className="text-xs text-on-surface-variant">
              {selectedCandidates.length} 件選択中
            </div>
          </div>

          <div className="space-y-3">
            {candidates.map((cand, idx) => {
              const isReady = isCandidateReadyToSave(cand.data);
              const isOtherOwner =
                cand.data.ownerMemberId &&
                cand.data.ownerMemberId !== currentMember.memberId;
              const ownerObj = data.members.find(
                (m) => m.memberId === cand.data.ownerMemberId
              );

              return (
                <div
                  key={idx}
                  style={{ "--stagger-delay": `${idx * 80}ms` } as React.CSSProperties}
                  className={`m3-stagger-fade-in rounded-[28px] transition-all p-5 bg-surface-container-lowest border-none shadow-none ${
                    cand.included
                      ? "ring-1 ring-primary"
                      : "opacity-60"
                  }`}
                >
                  {/* ヘッダー行：チェックボックスと引用 */}
                  <div className="flex items-center justify-between pb-3 mb-3 border-b border-outline-variant/20">
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cand.included}
                        onChange={() => toggleInclude(idx)}
                        className="h-4 w-4 rounded text-primary focus:ring-primary cursor-pointer"
                      />
                      <span className="text-xs font-medium text-on-surface">
                        {t("minutes.include_checkbox")} #{idx + 1}
                      </span>
                    </label>

                    {cand.data.evidence && (
                      <span className="text-[11px] text-on-surface-variant italic truncate max-w-md">
                        {t("minutes.evidence_label", {
                          evidence: cand.data.evidence,
                        })}
                      </span>
                    )}
                  </div>

                  {/* 候補フォームグリッド */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-[11px] font-medium text-on-surface-variant mb-1">
                        {t("task_form.field_title")} <span className="text-error">*</span>
                      </label>
                      <input
                        type="text"
                        value={cand.data.title}
                        onChange={(e) =>
                          updateCandidate(idx, { title: e.target.value })
                        }
                        className="w-full h-9 rounded-[8px] border border-outline-variant bg-surface-container-low px-3 text-xs text-on-surface focus:border-primary focus:bg-surface-container-lowest focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-on-surface-variant mb-1">
                        {t("task_form.field_next_action")}{" "}
                        <span className="text-error">*</span>
                      </label>
                      <input
                        type="text"
                        value={cand.data.nextAction}
                        onChange={(e) =>
                          updateCandidate(idx, { nextAction: e.target.value })
                        }
                        className="w-full h-9 rounded-[8px] border border-outline-variant bg-surface-container-low px-3 text-xs text-on-surface focus:border-primary focus:bg-surface-container-lowest focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-on-surface-variant mb-1">
                        {t("task_form.field_owner")}{" "}
                        <span className="text-error">*</span>
                      </label>
                      <select
                        value={cand.data.ownerMemberId}
                        onChange={(e) =>
                          updateCandidate(idx, {
                            ownerMemberId: e.target.value,
                          })
                        }
                        className="w-full h-9 rounded-[8px] border border-outline-variant bg-surface-container-low px-2.5 text-xs text-on-surface focus:border-primary focus:bg-surface-container-lowest focus:outline-none"
                      >
                        <option value="">
                          -- {lang === "en" ? "Select Owner" : "担当者を選択"} --
                        </option>
                        {data.members
                          .filter((m) => m.active)
                          .map((m) => (
                            <option key={m.memberId} value={m.memberId}>
                              {getMemberLabel(m.memberId)}
                            </option>
                          ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-on-surface-variant mb-1">
                        {t("task_form.field_roles")}{" "}
                        <span className="text-error">*</span>
                      </label>
                      <select
                        value={cand.data.roleIds[0] || ""}
                        onChange={(e) =>
                          updateCandidate(idx, {
                            roleIds: e.target.value ? [e.target.value] : [],
                          })
                        }
                        className="w-full h-9 rounded-[8px] border border-outline-variant bg-surface-container-low px-2.5 text-xs text-on-surface focus:border-primary focus:bg-surface-container-lowest focus:outline-none"
                      >
                        <option value="">
                          -- {lang === "en" ? "Select Role" : "役職を選択"} --
                        </option>
                        {data.roles
                          .filter((r) => r.active)
                          .map((r) => (
                            <option key={r.roleId} value={r.roleId}>
                              {r.name}
                            </option>
                          ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-on-surface-variant mb-1">
                        {t("task_form.field_weight")}
                      </label>
                      <select
                        value={cand.data.weight}
                        onChange={(e) =>
                          updateCandidate(idx, {
                            weight: e.target.value as "軽" | "中" | "重",
                          })
                        }
                        className="w-full h-9 rounded-[8px] border border-outline-variant bg-surface-container-low px-2.5 text-xs text-on-surface focus:border-primary focus:bg-surface-container-lowest focus:outline-none"
                      >
                        <option value="軽">軽（1〜2時間）</option>
                        <option value="中">中（半日〜1日）</option>
                        <option value="重">重（数日以上）</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-on-surface-variant mb-1">
                        {t("task_form.field_na_due")}{" "}
                        <span className="text-error">*</span>
                      </label>
                      <input
                        type="date"
                        value={cand.data.naDue}
                        onChange={(e) =>
                          updateCandidate(idx, { naDue: e.target.value })
                        }
                        className="w-full h-9 rounded-[8px] border border-outline-variant bg-surface-container-low px-2.5 text-xs text-on-surface focus:border-primary focus:bg-surface-container-lowest focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* 他者依頼時の注意（5.3） */}
                  {isOtherOwner && (
                    <p className="mt-2 text-[11px] text-on-secondary-container bg-secondary-container rounded-[8px] px-2.5 py-1">
                      {t("task_form.request_notice_info", {
                        owner_name: ownerObj?.displayName || cand.data.ownerMemberId,
                      })}
                    </p>
                  )}

                  {!isReady && cand.included && (
                    <p className="mt-2 text-[11px] font-medium text-secondary">
                      ※ タイトル・NA・担当者・役職・期限がすべて揃うと登録可能になります。
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* 一括登録アクションバー */}
          <div className="sticky bottom-6 rounded-[28px] bg-surface-container-lowest/95 backdrop-blur-md p-4 shadow-lg border-none flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              {anyIncompleteSelected ? (
                <p className="text-xs font-medium text-secondary">
                  {t("minutes.missing_required_warning").replace(
                    ":material/warning: ",
                    ""
                  )}
                </p>
              ) : (
                <p className="text-xs text-on-surface-variant">
                  {selectedCandidates.length} 件のタスクを新規作成します。
                </p>
              )}
            </div>

            <button
              type="button"
              disabled={
                isSaving ||
                selectedCandidates.length === 0 ||
                anyIncompleteSelected
              }
              onClick={handleSaveAll}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-10 rounded-full bg-primary px-6 text-xs font-medium text-on-primary hover:bg-primary/90 disabled:opacity-50 transition m3-interactive"
            >
              {isSaving ? (
                <>
                  <MaterialIcon name="refresh" className="text-base animate-spin" />
                  <span>登録中...</span>
                </>
              ) : (
                <>
                  <MaterialIcon name="check" className="text-base" />
                  <span>{t("minutes.save_selected_btn")}</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
