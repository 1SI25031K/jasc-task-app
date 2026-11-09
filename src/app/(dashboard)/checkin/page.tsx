"use client";

import React, { useState, useTransition } from "react";
import { useDashboard } from "@/context/DashboardContext";
import { calcMemberAutoLoad, getLatestCheckin } from "@/lib/services";
import { getTodayJST, parseFuzzyDate } from "@/lib/time";
import { saveCheckinAction } from "@/app/actions/checkins";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

export default function CheckinPage() {
  const { data, currentMember, lang, t, refresh } = useDashboard();
  const today = getTodayJST();

  const [comment, setComment] = useState("");
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    score: number;
    prevScore: number | null;
    autoPt: number;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const autoPt = calcMemberAutoLoad(currentMember.memberId, data.tasks, today);
  const { checkin: latestCheckin } = getLatestCheckin(
    currentMember.memberId,
    data.checkins,
    today
  );

  // 自分の回答履歴（日付降順）
  const memberHistory = data.checkins
    .filter((c) => c.memberId === currentMember.memberId)
    .sort((a, b) => b.date.localeCompare(a.date));

  const handleScoreSubmit = (scoreVal: number) => {
    setErrorMessage(null);
    startTransition(async () => {
      try {
        const res = await saveCheckinAction(scoreVal, comment);
        if (res.success) {
          setFeedback({
            score: res.score,
            prevScore: res.prevScore,
            autoPt: res.autoPt,
          });
          await refresh();
        } else {
          setErrorMessage(res.error);
        }
      } catch (err: any) {
        setErrorMessage(err.message || "通信エラーが発生しました。");
      }
    });
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      {/* ページタイトル */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-800">
          {t("checkin.title")}
        </h1>
        <p className="mt-1 text-sm text-slate-500">{t("checkin.subtitle")}</p>
      </div>

      {/* 回答成功フィードバックバナー */}
      {feedback && (
        <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-5 shadow-xs transition-all">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-bold text-emerald-900">
                {t("checkin.saved_message", { score: feedback.score }).replace(
                  ":material/check_circle: ",
                  ""
                )}
              </p>
              <p className="mt-1 text-xs text-emerald-800">
                {t("checkin.feedback_summary", {
                  current: feedback.score,
                  prev:
                    feedback.prevScore !== null
                      ? feedback.prevScore
                      : lang === "en"
                      ? "None"
                      : "なし",
                  auto_pt: feedback.autoPt,
                })}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* エラー表示 */}
      {errorMessage && (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 shadow-xs">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
            <p className="text-xs font-semibold text-red-800">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* チェックイン入力カード */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs mb-8">
        <div className="mb-4">
          <label className="block text-xs font-bold text-slate-700 mb-1">
            {t("checkin.comment_label")}
          </label>
          <div className="relative">
            <input
              type="text"
              maxLength={100}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={isPending}
              placeholder={
                lang === "en"
                  ? "e.g., Working on multiple tasks, feeling fine (optional)"
                  : "例：今週は複数タスクが重なっています、余裕ありなど（任意）"
              }
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-xs text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-hidden transition disabled:opacity-60"
            />
            <span className="absolute right-3 top-2.5 text-[10px] text-slate-400">
              {comment.length}/100
            </span>
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400">
            {t("checkin.privacy_notice")}
          </p>
        </div>

        {/* 1〜10 の数字ボタン */}
        <div className="mt-6">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium mb-2.5 px-1">
            <span className="text-emerald-700 font-semibold">
              1: {t("checkin.group_low")}
            </span>
            <span className="text-red-700 font-semibold">
              10: {t("checkin.group_high")}
            </span>
          </div>

          <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((val) => {
              const isSelected = latestCheckin?.score === val;
              const colorClass =
                val <= 3
                  ? "hover:border-emerald-500 hover:bg-emerald-50 text-emerald-800 active:bg-emerald-100"
                  : val <= 7
                  ? "hover:border-blue-500 hover:bg-blue-50 text-blue-800 active:bg-blue-100"
                  : "hover:border-red-500 hover:bg-red-50 text-red-800 active:bg-red-100";

              return (
                <button
                  key={val}
                  type="button"
                  disabled={isPending}
                  onClick={() => handleScoreSubmit(val)}
                  className={`group relative flex flex-col items-center justify-center rounded-xl border-2 py-3.5 text-base font-bold transition shadow-2xs disabled:cursor-not-allowed disabled:opacity-50 ${
                    isSelected
                      ? "border-blue-600 bg-blue-600 text-white shadow-md ring-2 ring-blue-200"
                      : `border-slate-200 bg-white ${colorClass}`
                  }`}
                >
                  {val}
                  {isSelected && (
                    <span className="absolute -top-2 rounded-full bg-blue-700 px-1.5 py-0.2 text-[9px] font-bold text-white uppercase tracking-wider">
                      {lang === "en" ? "Today" : "回答済"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {isPending && (
            <div className="mt-3 flex items-center justify-center gap-2 text-xs font-medium text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              <span>
                {lang === "en" ? "Saving check-in..." : "チェックインを保存中..."}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 現在の状況カード */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              {lang === "en" ? "Current Check-in Status" : "あなたの現在のステータス"}
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              {latestCheckin ? (
                <>
                  <span className="text-4xl font-extrabold text-blue-600">
                    {latestCheckin.score}
                  </span>
                  <span className="text-sm text-slate-500 font-medium">/ 10</span>
                  <span className="ml-2 text-xs font-semibold text-slate-400">
                    ({parseFuzzyDate(latestCheckin.date).dateString || latestCheckin.date}{" "}
                    {lang === "en" ? "recorded" : "回答"})
                  </span>
                </>
              ) : (
                <span className="text-lg font-semibold text-slate-400">
                  {lang === "en" ? "No check-ins recorded" : "回答記録がありません"}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 border-t sm:border-t-0 sm:border-l border-slate-100 pt-3 sm:pt-0 sm:pl-6">
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                {lang === "en" ? "Calculated Auto Load" : "現在の自動負荷"}
              </span>
              <p className="text-2xl font-bold text-slate-800 mt-0.5">{autoPt} pt</p>
            </div>
          </div>
        </div>

        {latestCheckin?.comment && (
          <div className="mt-4 pt-4 border-t border-slate-100 text-xs">
            <span className="font-semibold text-slate-500">
              {lang === "en" ? "Latest Note:" : "直近のコメント:"}
            </span>{" "}
            <span className="text-slate-700 font-medium">{latestCheckin.comment}</span>
          </div>
        )}
      </div>

      {/* スコア指標の説明 */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-6 shadow-xs mb-8">
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
          {lang === "en" ? "Check-in Scale Reference (1 - 10)" : "体感負荷スコアの目安"}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
            <span className="font-bold text-emerald-800">
              1 〜 3: {lang === "en" ? "Low Load" : "余裕あり"}
            </span>
            <p className="mt-1 text-emerald-700">
              タスクに十分な余裕があり、追加のサポートや案件を引き受ける余裕があります。
            </p>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3">
            <span className="font-bold text-blue-800">
              4 〜 6: {lang === "en" ? "Manageable" : "適正負荷"}
            </span>
            <p className="mt-1 text-blue-700">
              現在の担当業務を計画通り順調に進められている標準的な状態です。
            </p>
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50/50 p-3">
            <span className="font-bold text-red-800">
              7 〜 10: {lang === "en" ? "High Load" : "高負荷・相談希望"}
            </span>
            <p className="mt-1 text-red-700">
              期限やタスク量が多く負担を感じています。必要に応じて分担や支援を検討します。
            </p>
          </div>
        </div>
      </div>

      {/* 過去の回答履歴 */}
      <div>
        <h2 className="text-base font-bold text-slate-800 mb-4">
          {t("checkin.recent_history_title")}
        </h2>
        {memberHistory.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
            {lang === "en" ? "No check-in history found." : "過去の回答履歴はありません。"}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 font-semibold text-slate-500">
                <tr>
                  <th className="px-4 py-3">{lang === "en" ? "Date" : "回答日"}</th>
                  <th className="px-4 py-3">{lang === "en" ? "Score" : "体感スコア"}</th>
                  <th className="px-4 py-3">
                    {lang === "en" ? "Auto Load at Checkin" : "回答時自動負荷"}
                  </th>
                  <th className="px-4 py-3">{lang === "en" ? "Comment" : "コメント・メモ"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {memberHistory.map((item) => (
                  <tr key={item.checkinId} className="hover:bg-slate-50/50 transition">
                    <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">
                      {parseFuzzyDate(item.date).dateString || item.date}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          item.score >= 7
                            ? "bg-red-100 text-red-700"
                            : item.score <= 3
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {item.score}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                      {item.autoLoadAtCheckin !== null
                        ? `${item.autoLoadAtCheckin} pt`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {item.comment || <span className="text-slate-300 italic">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
