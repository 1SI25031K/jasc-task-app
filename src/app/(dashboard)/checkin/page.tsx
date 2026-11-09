"use client";

import React, { useState, useTransition } from "react";
import { useDashboard } from "@/context/DashboardContext";
import { useSnackbar } from "@/context/SnackbarContext";
import { calcMemberAutoLoad, getLatestCheckin } from "@/lib/services";
import { getTodayJST, parseFuzzyDate } from "@/lib/time";
import { saveCheckinAction } from "@/app/actions/checkins";
import { MaterialIcon } from "@/components/MaterialIcon";

export default function CheckinPage() {
  const { data, currentMember, lang, t, refresh } = useDashboard();
  const { showSnackbar } = useSnackbar();
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
          showSnackbar({
            message:
              lang === "en"
                ? `Workload score (${res.score}) recorded.`
                : `体感負荷スコア（${res.score}）を記録しました`,
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
        <h1 className="text-2xl font-normal tracking-tight text-on-surface">
          {t("checkin.title")}
        </h1>
        <p className="mt-1 text-sm text-on-surface-variant">{t("checkin.subtitle")}</p>
      </div>

      {/* エラー表示（S7・エラーは消さずに常時表示） */}
      {errorMessage && (
        <div className="rounded-[28px] bg-error-container text-on-error-container p-4">
          <div className="flex items-center gap-3">
            <MaterialIcon name="error_outline" className="text-xl text-error shrink-0" />
            <p className="text-xs font-medium">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* チェックイン入力カード（Level 0 flat, 角丸 28px, 枠線なし） */}
      <div className="rounded-[28px] bg-surface-container-lowest p-6 border-none shadow-none">
        <div className="mb-4">
          <label className="block text-xs font-medium text-on-surface-variant mb-1.5">
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
              className="w-full rounded-[12px] border border-outline-variant bg-surface-container-low px-3.5 py-2.5 text-xs text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:bg-surface-container-lowest focus:outline-none transition disabled:opacity-60"
            />
            <span className="absolute right-3 top-2.5 text-[10px] text-on-surface-variant">
              {comment.length}/100
            </span>
          </div>
          <p className="mt-1.5 text-[11px] text-on-surface-variant">
            {t("checkin.privacy_notice")}
          </p>
        </div>

        {/* 1〜10 の数字ボタン（M3 仕様） */}
        <div className="mt-6">
          <div className="flex items-center justify-between text-xs text-on-surface-variant font-normal mb-2.5 px-1">
            <span className="text-primary font-medium">
              1: {lang === "en" ? "Plenty of room" : "余裕あり"}
            </span>
            <span className="text-error font-medium">
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
                  className={`relative flex flex-col items-center justify-center rounded-[12px] h-12 text-base font-medium transition m3-interactive disabled:cursor-not-allowed ${
                    isSelected
                      ? "bg-primary text-on-primary ring-2 ring-primary-container"
                      : "bg-surface-container-low border border-outline-variant text-on-surface hover:bg-surface-container-high active:bg-surface-container-highest"
                  }`}
                >
                  {val}
                  {isSelected && (
                    <span className="absolute -top-2 rounded-full bg-on-primary-container px-1.5 py-0.2 text-[9px] font-medium text-surface-container-lowest uppercase tracking-wider">
                      {lang === "en" ? "Today" : "回答済"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {isPending && (
            <div className="mt-3 flex items-center justify-center gap-2 text-xs font-normal text-on-surface-variant">
              <MaterialIcon name="refresh" className="text-base animate-spin text-primary" />
              <span>
                {lang === "en" ? "Saving check-in..." : "チェックインを保存中..."}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 現在の状況カード（Level 0 flat, 角丸 28px, 枠線なし） */}
      <div className="rounded-[28px] bg-surface-container-lowest p-6 border-none shadow-none">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-xs font-medium text-on-surface-variant tracking-wider">
              {lang === "en" ? "CURRENT CHECK-IN STATUS" : "あなたの現在のステータス"}
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              {activeScore !== undefined && activeScore !== null ? (
                <>
                  <span className="text-4xl font-normal text-primary">
                    {activeScore}
                  </span>
                  <span className="text-sm text-on-surface-variant">/ 10</span>
                  <span className="ml-2 text-xs text-on-surface-variant">
                    ({latestCheckin ? parseFuzzyDate(latestCheckin.date).dateString || latestCheckin.date : today}{" "}
                    {lang === "en" ? "recorded" : "回答"})
                  </span>
                </>
              ) : (
                <span className="text-base font-normal text-on-surface-variant">
                  {lang === "en" ? "No check-ins recorded" : "回答記録がありません"}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 border-t sm:border-t-0 sm:border-l border-outline-variant/30 pt-3 sm:pt-0 sm:pl-6">
            <div>
              <span className="text-xs font-medium text-on-surface-variant tracking-wider">
                {lang === "en" ? "CALCULATED AUTO LOAD" : "現在の自動負荷"}
              </span>
              <p className="text-2xl font-normal text-on-surface mt-0.5">{autoPt} pt</p>
            </div>
          </div>
        </div>

        {/* F16 要件: 直近の回答後の自動負荷 & 前回の回答サマリー */}
        {feedback && (
          <div className="mt-3 pt-3 border-t border-outline-variant/30">
            <p className="text-xs text-on-surface-variant font-medium">
              {lang === "en"
                ? `Previous ${feedback.prevScore !== null ? feedback.prevScore : "None"} → Current ${feedback.score} ・ Auto load ${feedback.autoPt}pt`
                : `前回 ${feedback.prevScore !== null ? feedback.prevScore : "なし"} → 今回 ${feedback.score} ・ 自動負荷 ${feedback.autoPt}pt`}
            </p>
          </div>
        )}

        {latestCheckin?.comment && (
          <div className="mt-3 pt-3 border-t border-outline-variant/30 text-xs">
            <span className="font-medium text-on-surface-variant">
              {lang === "en" ? "Latest Note:" : "直近のコメント:"}
            </span>{" "}
            <span className="text-on-surface">{latestCheckin.comment}</span>
          </div>
        )}
      </div>

      {/* スコア指標の説明 */}
      <div className="rounded-[28px] bg-surface-container p-6 border-none shadow-none">
        <h2 className="text-xs font-medium text-on-surface-variant tracking-wider mb-3">
          {lang === "en" ? "CHECK-IN SCALE REFERENCE (1 - 10)" : "体感負荷スコアの目安"}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="rounded-[16px] bg-surface-container-lowest p-3 border-none">
            <span className="font-medium text-on-surface">
              1 〜 3: {lang === "en" ? "Low Load" : "余裕あり"}
            </span>
            <p className="mt-1 text-on-surface-variant">
              タスクに十分な余裕があり、追加のサポートや案件を引き受ける余裕があります。
            </p>
          </div>
          <div className="rounded-[16px] bg-surface-container-lowest p-3 border-none">
            <span className="font-medium text-on-surface">
              4 〜 6: {lang === "en" ? "Manageable" : "適正負荷"}
            </span>
            <p className="mt-1 text-on-surface-variant">
              現在の担当業務を計画通り順調に進められている標準的な状態です。
            </p>
          </div>
          <div className="rounded-[16px] bg-surface-container-lowest p-3 border-none">
            <span className="font-medium text-on-surface">
              7 〜 10: {lang === "en" ? "High Load" : "高負荷・相談希望"}
            </span>
            <p className="mt-1 text-on-surface-variant">
              期限やタスク量が多く負担を感じています。必要に応じて分担や支援を検討します。
            </p>
          </div>
        </div>
      </div>

      {/* 過去の回答履歴（M3 List / Table） */}
      <div>
        <h2 className="text-base font-normal text-on-surface mb-3">
          {t("checkin.recent_history_title")}
        </h2>
        {memberHistory.length === 0 ? (
          <div className="rounded-[16px] border border-dashed border-outline-variant p-8 text-center text-sm text-on-surface-variant">
            {lang === "en" ? "No check-in history found." : "過去の回答履歴はありません。"}
          </div>
        ) : (
          <div className="overflow-hidden rounded-[28px] bg-surface-container-lowest border-none shadow-none">
            <table className="min-w-full divide-y divide-outline-variant/20 text-left text-xs">
              <thead className="bg-surface-container-low font-medium text-on-surface-variant">
                <tr>
                  <th className="px-4 py-3">{lang === "en" ? "Date" : "回答日"}</th>
                  <th className="px-4 py-3">{lang === "en" ? "Score" : "体感スコア"}</th>
                  <th className="px-4 py-3">
                    {lang === "en" ? "Auto Load at Checkin" : "回答時自動負荷"}
                  </th>
                  <th className="px-4 py-3">{lang === "en" ? "Comment" : "コメント・メモ"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20 text-on-surface">
                {memberHistory.map((item) => (
                  <tr key={item.checkinId} className="hover:bg-surface-container-high/40 transition">
                    <td className="px-4 py-3 whitespace-nowrap">
                      {parseFuzzyDate(item.date).dateString || item.date}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          item.score >= 7
                            ? "bg-error-container text-on-error-container"
                            : item.score <= 3
                            ? "bg-secondary-container text-on-secondary-container"
                            : "bg-surface-container-high text-on-surface-variant"
                        }`}
                      >
                        {item.score}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-on-surface-variant">
                      {item.autoLoadAtCheckin !== null
                        ? `${item.autoLoadAtCheckin} pt`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant">
                      {item.comment || <span className="text-on-surface-variant/60 italic">—</span>}
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
