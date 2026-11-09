"use client";

import React, { useState, useTransition } from "react";
import { useDashboard } from "@/context/DashboardContext";
import { calcMemberAutoLoad, getLatestCheckin } from "@/lib/services";
import { getTodayJST, parseFuzzyDate } from "@/lib/time";
import { saveCheckinAction } from "@/app/actions/checkins";
import { MaterialIcon } from "@/components/MaterialIcon";

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

  // 送信直後に即座に UI を更新するための optimistic local score
  const [optimisticScore, setOptimisticScore] = useState<number | null>(null);

  const autoPt = calcMemberAutoLoad(currentMember.memberId, data.tasks, today);
  const { checkin: latestCheckin } = getLatestCheckin(
    currentMember.memberId,
    data.checkins,
    today
  );

  // 現在表示すべきスコア（楽観的スコア優先）
  const activeScore = optimisticScore ?? latestCheckin?.score;

  // 自分の回答履歴（日付降順）
  const memberHistory = data.checkins
    .filter((c) => c.memberId === currentMember.memberId)
    .sort((a, b) => b.date.localeCompare(a.date));

  const handleScoreSubmit = (scoreVal: number) => {
    setErrorMessage(null);
    setOptimisticScore(scoreVal); // 即座にハイライト切替

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
          setOptimisticScore(null); // 失敗時はロールバック
          setErrorMessage(res.error);
        }
      } catch (err: any) {
        setOptimisticScore(null);
        setErrorMessage(err.message || "通信エラーが発生しました。");
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* ページタイトル */}
      <div>
        <h1 className="text-2xl font-normal tracking-tight text-[#1F1F1F]">
          {t("checkin.title")}
        </h1>
        <p className="mt-1 text-sm text-[#444746]">{t("checkin.subtitle")}</p>
      </div>

      {/* 回答成功フィードバックバナー */}
      {feedback && (
        <div className="rounded-[28px] border border-[#146C2E]/40 bg-[#C4EED0]/40 p-5 shadow-xs transition-all">
          <div className="flex items-start gap-3">
            <MaterialIcon name="check_circle" className="text-xl text-[#146C2E] shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-[#072711]">
                {t("checkin.saved_message", { score: feedback.score }).replace(
                  ":material/check_circle: ",
                  ""
                )}
              </p>
              <p className="mt-1 text-xs text-[#072711]">
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
        <div className="rounded-[28px] border border-[#B3261E]/40 bg-[#F9DEDC] p-4 shadow-xs">
          <div className="flex items-center gap-3">
            <MaterialIcon name="error_outline" className="text-xl text-[#B3261E] shrink-0" />
            <p className="text-xs font-medium text-[#410E0B]">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* チェックイン入力カード（M3 Outlined Card） */}
      <div className="rounded-[28px] border border-[#C4C7C5]/40 bg-white p-6 shadow-xs">
        <div className="mb-4">
          <label className="block text-xs font-medium text-[#444746] mb-1.5">
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
              className="w-full rounded-[12px] border border-[#747775] bg-white px-3.5 py-2.5 text-xs text-[#1F1F1F] placeholder:text-[#747775] focus:border-[#0B57D0] focus:outline-none transition disabled:opacity-60"
            />
            <span className="absolute right-3 top-2.5 text-[10px] text-[#747775]">
              {comment.length}/100
            </span>
          </div>
          <p className="mt-1.5 text-[11px] text-[#747775]">
            {t("checkin.privacy_notice")}
          </p>
        </div>

        {/* 1〜10 の数字ボタン（二重番号解消済み） */}
        <div className="mt-6">
          <div className="flex items-center justify-between text-xs text-[#444746] font-normal mb-2.5 px-1">
            <span className="text-[#146C2E] font-medium">
              1: {lang === "en" ? "Plenty of room" : "余裕あり"}
            </span>
            <span className="text-[#B3261E] font-medium">
              10: {lang === "en" ? "High load" : "高負荷"}
            </span>
          </div>

          <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((val) => {
              const isSelected = activeScore === val;

              return (
                <button
                  key={val}
                  type="button"
                  disabled={isPending}
                  onClick={() => handleScoreSubmit(val)}
                  className={`relative flex flex-col items-center justify-center rounded-[12px] h-12 text-base font-medium transition shadow-2xs disabled:cursor-not-allowed ${
                    isSelected
                      ? "bg-[#0B57D0] text-white shadow-sm ring-2 ring-[#D3E3FD]"
                      : "bg-white border border-[#747775] text-[#1F1F1F] hover:bg-[#F3EDF7] active:bg-[#ECE6F0]"
                  }`}
                >
                  {val}
                  {isSelected && (
                    <span className="absolute -top-2 rounded-full bg-[#041E49] px-1.5 py-0.2 text-[9px] font-medium text-white uppercase tracking-wider">
                      {lang === "en" ? "Today" : "回答済"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {isPending && (
            <div className="mt-3 flex items-center justify-center gap-2 text-xs font-normal text-[#444746]">
              <MaterialIcon name="refresh" className="text-base animate-spin text-[#0B57D0]" />
              <span>
                {lang === "en" ? "Saving check-in..." : "チェックインを保存中..."}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 現在の状況カード */}
      <div className="rounded-[28px] border border-[#C4C7C5]/40 bg-white p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-xs font-medium text-[#747775] tracking-wider">
              {lang === "en" ? "CURRENT CHECK-IN STATUS" : "あなたの現在のステータス"}
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              {activeScore !== undefined && activeScore !== null ? (
                <>
                  <span className="text-4xl font-normal text-[#0B57D0]">
                    {activeScore}
                  </span>
                  <span className="text-sm text-[#747775]">/ 10</span>
                  <span className="ml-2 text-xs text-[#747775]">
                    ({latestCheckin ? parseFuzzyDate(latestCheckin.date).dateString || latestCheckin.date : today}{" "}
                    {lang === "en" ? "recorded" : "回答"})
                  </span>
                </>
              ) : (
                <span className="text-base font-normal text-[#747775]">
                  {lang === "en" ? "No check-ins recorded" : "回答記録がありません"}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 border-t sm:border-t-0 sm:border-l border-[#C4C7C5]/30 pt-3 sm:pt-0 sm:pl-6">
            <div>
              <span className="text-xs font-medium text-[#747775] tracking-wider">
                {lang === "en" ? "CALCULATED AUTO LOAD" : "現在の自動負荷"}
              </span>
              <p className="text-2xl font-normal text-[#1F1F1F] mt-0.5">{autoPt} pt</p>
            </div>
          </div>
        </div>

        {latestCheckin?.comment && (
          <div className="mt-4 pt-4 border-t border-[#C4C7C5]/30 text-xs">
            <span className="font-medium text-[#747775]">
              {lang === "en" ? "Latest Note:" : "直近のコメント:"}
            </span>{" "}
            <span className="text-[#1F1F1F]">{latestCheckin.comment}</span>
          </div>
        )}
      </div>

      {/* スコア指標の説明 */}
      <div className="rounded-[28px] border border-[#C4C7C5]/40 bg-[#F8F9FA] p-6 shadow-xs">
        <h2 className="text-xs font-medium text-[#747775] tracking-wider mb-3">
          {lang === "en" ? "CHECK-IN SCALE REFERENCE (1 - 10)" : "体感負荷スコアの目安"}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="rounded-[16px] border border-[#146C2E]/30 bg-white p-3">
            <span className="font-medium text-[#146C2E]">
              1 〜 3: {lang === "en" ? "Low Load" : "余裕あり"}
            </span>
            <p className="mt-1 text-[#072711]">
              タスクに十分な余裕があり、追加のサポートや案件を引き受ける余裕があります。
            </p>
          </div>
          <div className="rounded-[16px] border border-[#0B57D0]/30 bg-white p-3">
            <span className="font-medium text-[#0B57D0]">
              4 〜 6: {lang === "en" ? "Manageable" : "適正負荷"}
            </span>
            <p className="mt-1 text-[#041E49]">
              現在の担当業務を計画通り順調に進められている標準的な状態です。
            </p>
          </div>
          <div className="rounded-[16px] border border-[#B3261E]/30 bg-white p-3">
            <span className="font-medium text-[#B3261E]">
              7 〜 10: {lang === "en" ? "High Load" : "高負荷・相談希望"}
            </span>
            <p className="mt-1 text-[#410E0B]">
              期限やタスク量が多く負担を感じています。必要に応じて分担や支援を検討します。
            </p>
          </div>
        </div>
      </div>

      {/* 過去の回答履歴（M3 List / Table） */}
      <div>
        <h2 className="text-base font-normal text-[#1F1F1F] mb-3">
          {t("checkin.recent_history_title")}
        </h2>
        {memberHistory.length === 0 ? (
          <div className="rounded-[16px] border border-dashed border-[#C4C7C5] p-8 text-center text-sm text-[#747775]">
            {lang === "en" ? "No check-in history found." : "過去の回答履歴はありません。"}
          </div>
        ) : (
          <div className="overflow-hidden rounded-[28px] border border-[#C4C7C5]/40 bg-white shadow-xs">
            <table className="min-w-full divide-y divide-[#C4C7C5]/30 text-left text-xs">
              <thead className="bg-[#F8F9FA] font-medium text-[#747775]">
                <tr>
                  <th className="px-4 py-3">{lang === "en" ? "Date" : "回答日"}</th>
                  <th className="px-4 py-3">{lang === "en" ? "Score" : "体感スコア"}</th>
                  <th className="px-4 py-3">
                    {lang === "en" ? "Auto Load at Checkin" : "回答時自動負荷"}
                  </th>
                  <th className="px-4 py-3">{lang === "en" ? "Comment" : "コメント・メモ"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#C4C7C5]/30 text-[#1F1F1F]">
                {memberHistory.map((item) => (
                  <tr key={item.checkinId} className="hover:bg-[#F3EDF7]/30 transition">
                    <td className="px-4 py-3 whitespace-nowrap">
                      {parseFuzzyDate(item.date).dateString || item.date}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          item.score >= 7
                            ? "bg-[#F9DEDC] text-[#B3261E]"
                            : item.score <= 3
                            ? "bg-[#C4EED0] text-[#072711]"
                            : "bg-[#D3E3FD] text-[#041E49]"
                        }`}
                      >
                        {item.score}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-[#747775]">
                      {item.autoLoadAtCheckin !== null
                        ? `${item.autoLoadAtCheckin} pt`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-[#444746]">
                      {item.comment || <span className="text-[#747775] italic">—</span>}
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
