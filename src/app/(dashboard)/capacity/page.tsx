"use client";

import React, { useState } from "react";
import { useDashboard } from "@/context/DashboardContext";
import {
  calcMemberAutoLoad,
  scaleAutoLoadsTo10,
  getLatestCheckin,
  hasLoadGap,
  isDueThisWeekNA,
} from "@/lib/services";
import { Avatar } from "@/components/Avatar";
import { getTodayJST } from "@/lib/time";
import { Activity, AlertTriangle, HelpCircle, Info, MessageSquare } from "lucide-react";

export default function CapacityMapPage() {
  const { data, lang, t } = useDashboard();
  const [filterGapOnly, setFilterGapOnly] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const today = getTodayJST();

  // 全アクティブメンバーの自動負荷
  const autoLoads: Record<string, number> = {};
  for (const m of data.members.filter((m) => m.active)) {
    autoLoads[m.memberId] = calcMemberAutoLoad(m.memberId, data.tasks, today);
  }
  const scaledLoads = scaleAutoLoadsTo10(autoLoads);

  // メンバーごとのデータ集計
  const memberRows = data.members
    .filter((m) => m.active)
    .map((member) => {
      const autoPt = autoLoads[member.memberId] || 0;
      const scaledPt = scaledLoads[member.memberId] || 1;
      const { checkin, isFresh } = getLatestCheckin(member.memberId, data.checkins, today);
      const subjScore = checkin && isFresh ? checkin.score : null;
      const isGap = hasLoadGap(scaledPt, subjScore);

      const mOpenTasks = data.tasks.filter(
        (t) => !t.archived && t.ownerMemberId === member.memberId && t.status !== "完了"
      );
      const dueWeekCount = mOpenTasks.filter((t) => isDueThisWeekNA(t, today)).length;
      const pendingReqCount = data.tasks.filter(
        (t) =>
          !t.archived &&
          t.status !== "完了" &&
          t.ownerMemberId === member.memberId &&
          ["依頼中", "相談中"].includes(t.assignmentStatus) &&
          t.requestedBy !== member.memberId
      ).length;

      const mName = lang === "en" && member.displayNameEn ? member.displayNameEn : member.displayName;

      return {
        member,
        name: mName,
        autoPt,
        scaledPt,
        checkin,
        isFresh,
        subjScore,
        isGap,
        openTasksCount: mOpenTasks.length,
        dueWeekCount,
        pendingReqCount,
      };
    })
    .sort((a, b) => b.autoPt - a.autoPt);

  const displayedRows = filterGapOnly ? memberRows.filter((r) => r.isGap) : memberRows;
  const maxAutoPt = Math.max(...memberRows.map((r) => r.autoPt), 1);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* ページタイトル */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight text-slate-800">{t("capacity_map.title")}</h1>
        <p className="mt-1 text-xs text-slate-500 italic">※ {t("capacity_map.policy_banner")}</p>
      </div>

      {/* ヘルプ開閉アコーディオン */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600 shadow-xs">
        <button
          onClick={() => setShowHelp(!showHelp)}
          className="flex items-center gap-1.5 font-semibold text-slate-700 hover:text-blue-600 transition"
        >
          <HelpCircle className="h-4 w-4 text-slate-400" />
          <span>{t("capacity_map.help_expander")}</span>
        </button>
        {showHelp && (
          <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5 text-slate-600 leading-relaxed">
            <p>・<strong>自動負荷（pt）</strong>：直近14日以内に期限がある担当未完了タスクの重さ（軽=1, 中=2, 重=3）の合計です。</p>
            <p>・<strong>体感負荷（1〜10）</strong>：メンバーが直近7日以内に「体感負荷チェックイン」で回答した自己申告スコアです。</p>
            <p>・<strong>ギャップ注意</strong>：自動負荷（メンバー内最大値を10として換算）と体感負荷の差分が 4 以上ある場合に表示されます。業務の抱え込みや隠れた負荷の検知・サポートに役立ててください。</p>
          </div>
        )}
      </div>

      {/* フィルター＆集計ステータスバー */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterGapOnly(false)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              !filterGapOnly
                ? "bg-slate-900 text-white shadow-xs"
                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            {lang === "en" ? `All Members (${memberRows.length})` : `全員 (${memberRows.length}名)`}
          </button>
          <button
            onClick={() => setFilterGapOnly(true)}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              filterGapOnly
                ? "bg-amber-600 text-white shadow-xs"
                : "bg-white text-amber-700 hover:bg-amber-50 border border-amber-300"
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>
              {lang === "en"
                ? `Gap Alert (${memberRows.filter((r) => r.isGap).length})`
                : `ギャップあり (${memberRows.filter((r) => r.isGap).length}名)`}
            </span>
          </button>
        </div>
      </div>

      {/* メンバー余力リスト */}
      <div className="space-y-4">
        {displayedRows.map((row) => (
          <div
            key={row.member.memberId}
            className={`rounded-2xl border p-5 transition ${
              row.isGap
                ? "border-amber-300 bg-amber-50/20 shadow-xs"
                : "border-slate-200 bg-white shadow-xs"
            }`}
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              {/* メンバー情報 */}
              <div className="flex items-center gap-3.5 min-w-[220px]">
                <Avatar name={row.name} memberId={row.member.memberId} size={44} />
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-800 text-base">{row.name}</h3>
                    {row.isGap && (
                      <span className="flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                        <AlertTriangle className="h-3 w-3" />
                        {lang === "en" ? "Load Gap" : "負荷ギャップ"}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {lang === "en" ? "Tasks:" : "残タスク:"} {row.openTasksCount}
                    {" · "}
                    {lang === "en" ? "Due this week:" : "今週期限:"} {row.dueWeekCount}
                    {row.pendingReqCount > 0 && (
                      <span className="text-amber-700 font-medium">
                        {" · "}
                        {lang === "en" ? "Requests:" : "未回答依頼:"} {row.pendingReqCount}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* 負荷バーと数値 */}
              <div className="flex-1 max-w-md">
                <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                  <span className="text-slate-600">
                    {lang === "en" ? "Auto Load:" : "自動負荷:"}{" "}
                    <strong className="text-slate-900 font-bold">{row.autoPt} pt</strong>
                    <span className="text-slate-400 font-normal"> (換算 {row.scaledPt}/10)</span>
                  </span>
                  <span className="text-slate-600">
                    {lang === "en" ? "Subjective:" : "体感負荷:"}{" "}
                    {row.subjScore !== null ? (
                      <strong className="text-blue-600 font-bold">{row.subjScore} / 10</strong>
                    ) : (
                      <span className="text-slate-400 italic font-normal">
                        {lang === "en" ? "Unanswered" : "未回答"}
                      </span>
                    )}
                  </span>
                </div>

                {/* 自動負荷ゲージ */}
                <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all duration-300"
                    style={{ width: `${Math.min(100, Math.round((row.autoPt / maxAutoPt) * 100))}%` }}
                  />
                </div>
              </div>

              {/* 直近のコメント */}
              <div className="min-w-[200px] max-w-xs text-xs text-slate-500">
                {row.checkin?.comment ? (
                  <div className="flex items-start gap-1.5 rounded-lg bg-slate-50 p-2 border border-slate-100">
                    <MessageSquare className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <p className="line-clamp-2 text-slate-700 font-medium">{row.checkin.comment}</p>
                  </div>
                ) : (
                  <span className="text-slate-400 italic">
                    {lang === "en" ? "No check-in comments" : "コメントなし"}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

