"use client";

import React from "react";
import { useDashboard } from "@/context/DashboardContext";
import { calcMemberAutoLoad, getLatestCheckin } from "@/lib/services";
import { getTodayJST, parseFuzzyDate } from "@/lib/time";
import { Smile, Calendar, Info, Clock, CheckCircle } from "lucide-react";

export default function CheckinPage() {
  const { data, currentMember, lang, t } = useDashboard();
  const today = getTodayJST();

  const autoPt = calcMemberAutoLoad(currentMember.memberId, data.tasks, today);
  const { checkin: latestCheckin, isFresh } = getLatestCheckin(currentMember.memberId, data.checkins, today);

  // 自分の回答履歴（日付降順）
  const memberHistory = data.checkins
    .filter((c) => c.memberId === currentMember.memberId)
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      {/* ページタイトル */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-800">{t("checkin.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("checkin.subtitle")}</p>
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
                  <span className="text-4xl font-extrabold text-blue-600">{latestCheckin.score}</span>
                  <span className="text-sm text-slate-500 font-medium">/ 10</span>
                  <span className="ml-2 text-xs font-semibold text-slate-400">
                    ({parseFuzzyDate(latestCheckin.date).dateString || latestCheckin.date} 回答)
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
            <span className="font-semibold text-slate-500">{lang === "en" ? "Latest Note:" : "直近のコメント:"}</span>{" "}
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
            <span className="font-bold text-emerald-800">1 〜 3: {lang === "en" ? "Low Load" : "余裕あり"}</span>
            <p className="mt-1 text-emerald-700">タスクに十分な余裕があり、追加のサポートや案件を引き受ける余裕があります。</p>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3">
            <span className="font-bold text-blue-800">4 〜 6: {lang === "en" ? "Manageable" : "適正負荷"}</span>
            <p className="mt-1 text-blue-700">現在の担当業務を計画通り順調に進められている標準的な状態です。</p>
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50/50 p-3">
            <span className="font-bold text-red-800">7 〜 10: {lang === "en" ? "High Load" : "高負荷・相談希望"}</span>
            <p className="mt-1 text-red-700">期限やタスク量が多く負担を感じています。必要に応じて分担や支援を検討します。</p>
          </div>
        </div>
      </div>

      {/* 過去の回答履歴 */}
      <div>
        <h2 className="text-base font-bold text-slate-800 mb-4">{t("checkin.recent_history_title")}</h2>
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
                  <th className="px-4 py-3">{lang === "en" ? "Auto Load at Checkin" : "回答時自動負荷"}</th>
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
                      {item.autoLoadAtCheckin !== null ? `${item.autoLoadAtCheckin} pt` : "—"}
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

