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
import { MaterialIcon } from "@/components/MaterialIcon";

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
    <div className="space-y-6">
      {/* ページタイトル */}
      <div>
        <h1 className="text-2xl font-normal tracking-tight text-on-surface">{t("capacity_map.title")}</h1>
        <p className="mt-1 text-xs text-on-surface-variant italic">※ {t("capacity_map.policy_banner")}</p>
      </div>

      {/* ヘルプ開閉アコーディオン */}
      <div className="rounded-[28px] bg-surface-container-lowest p-5 text-xs text-on-surface-variant border-none shadow-none">
        <button
          onClick={() => setShowHelp(!showHelp)}
          className="flex items-center gap-1.5 font-medium text-on-surface hover:text-primary transition m3-interactive"
        >
          <MaterialIcon name="help_outline" className="text-base text-on-surface-variant" />
          <span>{t("capacity_map.help_expander")}</span>
        </button>
        {showHelp && (
          <div className="mt-3 pt-3 border-t border-outline-variant/20 space-y-1.5 text-on-surface-variant leading-relaxed">
            <p>・<strong>自動負荷（pt）</strong>：直近14日以内に期限がある担当未完了タスクの重さ（軽=1, 中=2, 重=3）の合計です。</p>
            <p>・<strong>体感負荷（1〜10）</strong>：メンバーが直近7日以内に「体感負荷チェックイン」で回答した自己申告スコアです。</p>
            <p>・<strong>ギャップ注意</strong>：自動負荷（メンバー内最大値を10として換算）と体感負荷の差分が 4 以上ある場合に表示されます。業務の抱え込みや隠れた負荷の検知・サポートに役立ててください。</p>
          </div>
        )}
      </div>

      {/* M3 Filter Chips */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setFilterGapOnly(false)}
          className={`h-8 rounded-[8px] px-3.5 text-xs font-medium transition flex items-center gap-1.5 m3-interactive ${
            !filterGapOnly
              ? "bg-secondary-container text-on-secondary-container"
              : "bg-surface-container-lowest text-on-surface-variant border border-outline-variant hover:bg-surface-container-high"
          }`}
        >
          {!filterGapOnly && <MaterialIcon name="check" className="text-sm text-primary" />}
          <span>{lang === "en" ? `All Members (${memberRows.length})` : `全員 (${memberRows.length}名)`}</span>
        </button>
        <button
          onClick={() => setFilterGapOnly(true)}
          className={`h-8 rounded-[8px] px-3.5 text-xs font-medium transition flex items-center gap-1.5 m3-interactive ${
            filterGapOnly
              ? "bg-secondary-container text-on-secondary-container"
              : "bg-surface-container-lowest text-on-surface-variant border border-outline-variant hover:bg-surface-container-high"
          }`}
        >
          {filterGapOnly && <MaterialIcon name="check" className="text-sm text-primary" />}
          <MaterialIcon name="warning" className="text-sm" />
          <span>
            {lang === "en"
              ? `Gap Alert (${memberRows.filter((r) => r.isGap).length})`
              : `ギャップあり (${memberRows.filter((r) => r.isGap).length}名)`}
          </span>
        </button>
      </div>

      {/* メンバー余力リスト（Level 0 flat, radius 28px, 枠線なし, 影なし） */}
      <div className="space-y-4">
        {displayedRows.map((row) => (
          <div
            key={row.member.memberId}
            className={`rounded-[28px] border-none shadow-none p-5 transition bg-surface-container-lowest hover:bg-surface-container-low ${
              row.isGap ? "ring-1 ring-secondary" : ""
            }`}
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              {/* メンバー情報 */}
              <div className="flex items-center gap-3.5 min-w-[220px]">
                <Avatar name={row.name} memberId={row.member.memberId} size={44} />
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-on-surface text-base">{row.name}</h3>
                    {row.isGap && (
                      <span className="flex items-center gap-1 rounded-[8px] bg-secondary-container px-2 py-0.5 text-[11px] font-medium text-on-secondary-container">
                        <MaterialIcon name="warning" className="text-xs" />
                        {lang === "en" ? "Load Gap" : "負荷ギャップ"}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-on-surface-variant mt-0.5">
                    {lang === "en" ? "Tasks:" : "残タスク:"} {row.openTasksCount}
                    {" · "}
                    {lang === "en" ? "Due this week:" : "今週期限:"} {row.dueWeekCount}
                    {row.pendingReqCount > 0 && (
                      <span className="text-on-surface font-medium">
                        {" · "}
                        {lang === "en" ? "Requests:" : "未回答依頼:"} {row.pendingReqCount}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* 負荷バーと数値 */}
              <div className="flex-1 max-w-md">
                <div className="flex items-center justify-between text-xs font-normal mb-1.5">
                  <span className="text-on-surface-variant">
                    {lang === "en" ? "Auto Load:" : "自動負荷:"}{" "}
                    <strong className="text-on-surface font-medium">{row.autoPt} pt</strong>
                    <span className="text-on-surface-variant/80"> (換算 {row.scaledPt}/10)</span>
                  </span>
                  <span className="text-on-surface-variant">
                    {lang === "en" ? "Subjective:" : "体感負荷:"}{" "}
                    {row.subjScore !== null ? (
                      <strong className="text-primary font-medium">{row.subjScore} / 10</strong>
                    ) : (
                      <span className="text-on-surface-variant/70 italic">
                        {lang === "en" ? "Unanswered" : "未回答"}
                      </span>
                    )}
                  </span>
                </div>

                {/* 自動負荷ゲージ */}
                <div className="h-2 w-full rounded-full bg-surface-container-high overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{ width: `${Math.min(100, Math.round((row.autoPt / maxAutoPt) * 100))}%` }}
                  />
                </div>
              </div>

              {/* 直近のコメント */}
              <div className="min-w-[200px] max-w-xs text-xs text-on-surface-variant">
                {row.checkin?.comment ? (
                  <div className="flex items-start gap-1.5 rounded-[12px] bg-surface-container p-2.5 border border-outline-variant/20">
                    <MaterialIcon name="chat_bubble_outline" className="text-sm text-on-surface-variant shrink-0 mt-0.5" />
                    <p className="line-clamp-2 text-on-surface font-normal">{row.checkin.comment}</p>
                  </div>
                ) : (
                  <span className="text-on-surface-variant/70 italic">
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
