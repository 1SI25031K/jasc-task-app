"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useDashboard } from "@/context/DashboardContext";
import { getTodayJST } from "@/lib/time";
import { calcMemberAutoLoad, getLatestCheckin } from "@/lib/services";
import { extractNaAction, saveExtractedTasksAction } from "@/app/actions/minutes";
import { NaCandidate, isCandidateReadyToSave } from "@/lib/gemini";
import {
  Sparkles,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Calendar,
  User,
  Shield,
  FileText,
  AlertCircle,
} from "lucide-react";

export default function MinutesPage() {
  const router = useRouter();
  const { data, currentMember, lang, t, refresh } = useDashboard();
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
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
    setSuccessMessage(null);
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
    if (selectedCandidates.length === 0) {
      setErrorMessage(t("minutes.no_candidate_selected"));
      return;
    }
    if (anyIncompleteSelected) {
      setErrorMessage(t("minutes.missing_required_warning"));
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
          setSuccessMessage(
            t("minutes.saved_count_toast", { count: res.savedCount })
          );
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
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      {/* ページヘッダー */}
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-blue-600" />
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">
            {t("minutes.title")}
          </h1>
        </div>
        <p className="mt-1 text-xs text-slate-500">{t("minutes.ai_note")}</p>
      </div>

      {/* 注意書きバナー（S12） */}
      <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 text-xs text-amber-900 shadow-2xs">
        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <p>{t("minutes.privacy_warning").replace(":material/warning: ", "")}</p>
      </div>

      {/* エラー表示 */}
      {errorMessage && (
        <div className="mb-6 flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-800 shadow-2xs">
          <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
          <p>{errorMessage}</p>
        </div>
      )}

      {/* 成功表示 */}
      {successMessage && (
        <div className="mb-6 flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-bold text-emerald-800 shadow-2xs">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <p>{successMessage}</p>
        </div>
      )}

      {/* 議事メモ入力フォーム */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs mb-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {t("minutes.meeting_date_label")}
            </label>
            <input
              type="date"
              value={meetingDate}
              onChange={(e) => setMeetingDate(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-hidden"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {t("minutes.meeting_title_label")}
            </label>
            <input
              type="text"
              value={meetingTitle}
              onChange={(e) => setMeetingTitle(e.target.value)}
              placeholder="例：第5回 定例会"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-hidden"
            />
          </div>
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-bold text-slate-700">
              {t("minutes.minutes_text_label")}
            </label>
            <span className="text-[10px] text-slate-400">
              {minutesText.length} / 20,000
            </span>
          </div>
          <textarea
            rows={7}
            value={minutesText}
            onChange={(e) => setMinutesText(e.target.value)}
            placeholder={t("minutes.minutes_text_placeholder")}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-xs text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-hidden font-mono leading-relaxed"
          />
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            disabled={isExtracting || !minutesText.trim()}
            onClick={handleExtract}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 transition"
          >
            {isExtracting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>
                  {lang === "en" ? "Extracting NAs..." : "AI が解析中..."}
                </span>
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                <span>
                  {t("minutes.extract_btn").replace(":material/add_task: ", "")}
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 抽出された NA 候補リスト */}
      {candidates.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-slate-800">
              {t("minutes.candidates_section")} ({candidates.length}件)
            </h2>
            <div className="text-xs text-slate-500">
              {selectedCandidates.length} 件選択中
            </div>
          </div>

          <div className="space-y-4 mb-6">
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
                  className={`rounded-2xl border transition-all p-5 shadow-xs ${
                    cand.included
                      ? "border-blue-200 bg-white ring-1 ring-blue-100"
                      : "border-slate-200 bg-slate-50/60 opacity-60"
                  }`}
                >
                  {/* ヘッダー行：チェックボックスと引用 */}
                  <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cand.included}
                        onChange={() => toggleInclude(idx)}
                        className="h-4 w-4 rounded-sm border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                      <span className="text-xs font-bold text-slate-800">
                        {t("minutes.include_checkbox")} #{idx + 1}
                      </span>
                    </label>

                    {cand.data.evidence && (
                      <span className="text-[11px] text-slate-400 italic truncate max-w-md">
                        {t("minutes.evidence_label", {
                          evidence: cand.data.evidence,
                        })}
                      </span>
                    )}
                  </div>

                  {/* 候補フォームグリッド */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        {t("task_form.field_title")} <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={cand.data.title}
                        onChange={(e) =>
                          updateCandidate(idx, { title: e.target.value })
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-hidden"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        {t("task_form.field_next_action")}{" "}
                        <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={cand.data.nextAction}
                        onChange={(e) =>
                          updateCandidate(idx, { nextAction: e.target.value })
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-hidden"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        {t("task_form.field_owner")}{" "}
                        <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={cand.data.ownerMemberId}
                        onChange={(e) =>
                          updateCandidate(idx, {
                            ownerMemberId: e.target.value,
                          })
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-hidden"
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
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        {t("task_form.field_roles")}{" "}
                        <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={cand.data.roleIds[0] || ""}
                        onChange={(e) =>
                          updateCandidate(idx, {
                            roleIds: e.target.value ? [e.target.value] : [],
                          })
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-hidden"
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
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        {t("task_form.field_weight")}
                      </label>
                      <select
                        value={cand.data.weight}
                        onChange={(e) =>
                          updateCandidate(idx, {
                            weight: e.target.value as "軽" | "中" | "重",
                          })
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-hidden"
                      >
                        <option value="軽">軽（1〜2時間）</option>
                        <option value="中">中（半日〜1日）</option>
                        <option value="重">重（数日以上）</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        {t("task_form.field_na_due")}{" "}
                        <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        value={cand.data.naDue}
                        onChange={(e) =>
                          updateCandidate(idx, { naDue: e.target.value })
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-hidden"
                      />
                    </div>
                  </div>

                  {/* 他者依頼時の注意（5.3） */}
                  {isOtherOwner && (
                    <p className="mt-2 text-[11px] text-blue-700 bg-blue-50 rounded-lg px-2.5 py-1">
                      {t("task_form.request_notice_info", {
                        owner_name: ownerObj?.displayName || cand.data.ownerMemberId,
                      })}
                    </p>
                  )}

                  {!isReady && cand.included && (
                    <p className="mt-2 text-[11px] font-semibold text-amber-700">
                      ※ タイトル・NA・担当者・役職・期限がすべて揃うと登録可能になります。
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* 一括登録アクションバー */}
          <div className="sticky bottom-6 rounded-2xl border border-slate-200 bg-white/95 backdrop-blur-md p-4 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              {anyIncompleteSelected ? (
                <p className="text-xs font-semibold text-amber-700">
                  {t("minutes.missing_required_warning").replace(
                    ":material/warning: ",
                    ""
                  )}
                </p>
              ) : (
                <p className="text-xs text-slate-600">
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
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 transition"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>登録中...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
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

