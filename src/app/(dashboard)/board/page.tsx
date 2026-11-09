"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useDashboard } from "@/context/DashboardContext";
import { buildRoleBoardSummaries } from "@/lib/services";
import { getTodayJST, parseFuzzyDate } from "@/lib/time";
import { Avatar } from "@/components/Avatar";
import { MaterialIcon } from "@/components/MaterialIcon";

const CATEGORIES = ["すべて", "主役職", "副役職", "サイト", "その他"] as const;

export default function BoardPage() {
  const { data, currentMember, lang, t } = useDashboard();
  const [selectedCategory, setSelectedCategory] = useState<string>("すべて");
  const today = getTodayJST();

  const summaries = buildRoleBoardSummaries(
    data.roles,
    data.members,
    data.roleAssignments,
    data.tasks,
    today
  );

  // 上部バナー用集計
  const pendingRequestsCount = data.tasks.filter(
    (task) =>
      !task.archived &&
      task.status !== "完了" &&
      task.ownerMemberId === currentMember.memberId &&
      ["依頼中", "相談中"].includes(task.assignmentStatus) &&
      task.requestedBy !== currentMember.memberId
  ).length;

  const hasTodayCheckin = data.checkins.some(
    (c) => c.memberId === currentMember.memberId && c.date === today
  );

  // カテゴリ絞り込み
  const filteredSummaries = summaries.filter((s) => {
    if (selectedCategory === "すべて") return true;
    return s.role.category === selectedCategory;
  });

  const memberMap = new Map(data.members.map((m) => [m.memberId, m]));

  return (
    <div className="space-y-6">
      {/* ページヘッダー */}
      <div>
        <h1 className="text-2xl font-normal tracking-tight text-[#1F1F1F]">{t("board.title")}</h1>
        <p className="mt-1 text-sm text-[#444746]">{t("board.subtitle")}</p>
      </div>

      {/* 上部お知らせバナー */}
      {(pendingRequestsCount > 0 || !hasTodayCheckin) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {pendingRequestsCount > 0 && (
            <div className="flex items-center justify-between rounded-[28px] border border-[#C4C7C5]/40 bg-white p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#D3E3FD] text-[#0B57D0]">
                  <MaterialIcon name="inbox" className="text-xl" />
                </div>
                <span className="text-sm font-medium text-[#1F1F1F]">
                  {t("board.banner_requests", { count: pendingRequestsCount })}
                </span>
              </div>
              <Link
                href="/inbox"
                className="h-9 px-4 rounded-full bg-[#0B57D0] text-xs font-medium text-white hover:bg-[#0B57D0]/90 transition inline-flex items-center"
              >
                {t("board.banner_requests_btn")}
              </Link>
            </div>
          )}

          {!hasTodayCheckin && (
            <div className="flex items-center justify-between rounded-[28px] border border-[#C4C7C5]/40 bg-white p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#E9DDFF] text-[#6B4FBB]">
                  <MaterialIcon name="mood" className="text-xl" />
                </div>
                <span className="text-sm font-medium text-[#1F1F1F]">
                  {t("board.banner_checkin")}
                </span>
              </div>
              <Link
                href="/checkin"
                className="h-9 px-4 rounded-full bg-[#0B57D0] text-xs font-medium text-white hover:bg-[#0B57D0]/90 transition inline-flex items-center"
              >
                {t("board.banner_checkin_btn")}
              </Link>
            </div>
          )}
        </div>
      )}

      {/* カテゴリ選択タブ（M3 Filter Chips） */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
        {CATEGORIES.map((cat) => {
          const isSelected = selectedCategory === cat;
          const label =
            cat === "すべて"
              ? lang === "en"
                ? "All"
                : "すべて"
              : lang === "en"
              ? cat === "主役職"
                ? "Main Roles"
                : cat === "副役職"
                ? "Sub Roles"
                : cat === "サイト"
                ? "Site"
                : "Other"
              : cat;

          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`h-8 rounded-[8px] px-3.5 text-xs font-medium transition shrink-0 flex items-center gap-1.5 ${
                isSelected
                  ? "bg-[#D3E3FD] text-[#041E49] font-medium"
                  : "bg-white text-[#444746] border border-[#747775] hover:bg-[#F3EDF7]"
              }`}
            >
              {isSelected && <MaterialIcon name="check" className="text-sm text-[#0B57D0]" />}
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      {/* 役職カードグリッド（M3 Cards: radius 28px, white, border outline-variant/40） */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredSummaries.map((summary) => {
          const role = summary.role;
          const roleName = lang === "en" && role.nameEn ? role.nameEn : role.name;
          const leadName = summary.leadMember
            ? lang === "en" && summary.leadMember.displayNameEn
              ? summary.leadMember.displayNameEn
              : summary.leadMember.displayName
            : t("common.unassigned");

          const nearestTask = summary.nearestNaTask;
          const nearestOwner = nearestTask ? memberMap.get(nearestTask.ownerMemberId) : null;
          const nearestOwnerName = nearestOwner
            ? lang === "en" && nearestOwner.displayNameEn
              ? nearestOwner.displayNameEn
              : nearestOwner.displayName
            : nearestTask?.ownerMemberId || "";

          return (
            <div
              key={role.roleId}
              className="flex flex-col justify-between rounded-[28px] border border-[#C4C7C5]/40 bg-white p-5 shadow-xs hover:border-[#747775] transition"
            >
              <div>
                {/* 役職名とカテゴリ */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h2 className="text-lg font-medium text-[#1F1F1F]">{roleName}</h2>
                  <span className="rounded-[8px] bg-[#F3EDF7] px-2 py-0.5 text-[11px] font-normal text-[#444746] shrink-0">
                    {role.category}
                  </span>
                </div>

                {/* 責任者 */}
                <div className="flex items-center gap-2 mb-3">
                  {summary.leadMember ? (
                    <Avatar name={leadName} memberId={summary.leadMember.memberId} size={22} />
                  ) : null}
                  <span className="text-xs text-[#444746]">
                    {lang === "en" ? "Lead: " : "責任者: "}
                    <span className="text-[#1F1F1F] font-medium">{leadName}</span>
                  </span>
                </div>

                {/* 件数サマリー（1行表示） */}
                <div className="text-xs text-[#444746] mb-4 py-1.5 px-3 rounded-[8px] bg-[#F8F9FA] border border-[#C4C7C5]/30 flex items-center gap-2">
                  <span>
                    {lang === "en" ? "Open" : "未完了"} <strong className="font-medium text-[#1F1F1F]">{summary.openTaskCount}</strong>
                  </span>
                  <span>·</span>
                  <span className={summary.overdueNaCount > 0 ? "text-[#B3261E] font-medium" : "text-[#444746]"}>
                    {lang === "en" ? "Overdue" : "期限切れ"} <strong>{summary.overdueNaCount}</strong>
                  </span>
                  <span>·</span>
                  <span>
                    {lang === "en" ? "This week" : "今週"} <strong className="font-medium text-[#1F1F1F]">{summary.dueThisWeekNaCount}</strong>
                  </span>
                </div>

                {/* 直近の NA */}
                <div className="mb-4">
                  <div className="text-[11px] font-medium text-[#747775] tracking-wider mb-1">
                    {lang === "en" ? "NEXT ACTION" : "直近の NA"}
                  </div>
                  {nearestTask ? (
                    <div className="rounded-[12px] border border-[#C4C7C5]/30 bg-[#F8F9FA] p-2.5 text-xs">
                      <p className="font-medium text-[#1F1F1F] line-clamp-1" title={nearestTask.nextAction}>
                        {nearestTask.nextAction}
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-[#444746]">
                        <span className="flex items-center gap-1">
                          <MaterialIcon name="calendar_today" className="text-xs text-[#747775]" />
                          {parseFuzzyDate(nearestTask.naDue).dateString || nearestTask.naDue}
                        </span>
                        <span>·</span>
                        <span>{nearestOwnerName}</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-[#747775] italic py-1">{t("board.no_open_na")}</p>
                  )}
                </div>
              </div>

              {/* 役職詳細リンク */}
              <div className="pt-2 border-t border-[#C4C7C5]/30 flex justify-end">
                <Link
                  href={`/roles/${role.roleId}`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#0B57D0] hover:underline"
                >
                  <span>{lang === "en" ? "View Details" : "役職詳細"}</span>
                  <MaterialIcon name="arrow_forward" className="text-sm" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
