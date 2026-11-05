"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useDashboard } from "@/context/DashboardContext";
import { buildRoleBoardSummaries } from "@/lib/services";
import { getTodayJST, parseFuzzyDate } from "@/lib/time";
import { Avatar } from "@/components/Avatar";
import { ArrowRight, AlertTriangle, Inbox, Smile, Calendar } from "lucide-react";

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
    (t) =>
      !t.archived &&
      t.status !== "完了" &&
      t.ownerMemberId === currentMember.memberId &&
      ["依頼中", "相談中"].includes(t.assignmentStatus) &&
      t.requestedBy !== currentMember.memberId
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
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* ページヘッダー */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-800">{t("board.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("board.subtitle")}</p>
      </div>

      {/* 上部お知らせバナー */}
      {(pendingRequestsCount > 0 || !hasTodayCheckin) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {pendingRequestsCount > 0 && (
            <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/80 p-4">
              <div className="flex items-center gap-3">
                <Inbox className="h-5 w-5 text-amber-700 shrink-0" />
                <span className="text-sm font-medium text-amber-900">
                  {t("board.banner_requests", { count: pendingRequestsCount })}
                </span>
              </div>
              <Link
                href="/inbox"
                className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-amber-700 transition"
              >
                {t("board.banner_requests_btn")}
              </Link>
            </div>
          )}

          {!hasTodayCheckin && (
            <div className="flex items-center justify-between rounded-xl border border-purple-200 bg-purple-50/80 p-4">
              <div className="flex items-center gap-3">
                <Smile className="h-5 w-5 text-purple-700 shrink-0" />
                <span className="text-sm font-medium text-purple-900">
                  {t("board.banner_checkin")}
                </span>
              </div>
              <Link
                href="/checkin"
                className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-purple-700 transition"
              >
                {t("board.banner_checkin_btn")}
              </Link>
            </div>
          )}
        </div>
      )}

      {/* カテゴリ選択タブ（クライアント側即時切替） */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-4 mb-6 border-b border-slate-200 no-scrollbar">
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
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition shrink-0 ${
                isSelected
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* 役職カードグリッド */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
              className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-xs hover:border-blue-300 hover:shadow-md transition"
            >
              <div>
                {/* 役職名とカテゴリ */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h2 className="text-xl font-bold tracking-tight text-slate-800">{roleName}</h2>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 shrink-0">
                    {role.category}
                  </span>
                </div>

                {/* 責任者 */}
                <div className="flex items-center gap-2 mb-4">
                  {summary.leadMember ? (
                    <Avatar name={leadName} memberId={summary.leadMember.memberId} size={22} />
                  ) : null}
                  <span className="text-xs text-slate-500 font-medium">
                    {lang === "en" ? "Lead: " : "責任者: "}
                    <span className="text-slate-700">{leadName}</span>
                  </span>
                </div>

                {/* 件数サマリー */}
                <div className="flex flex-wrap items-center gap-3 text-xs mb-5 rounded-lg bg-slate-50 p-2.5 border border-slate-100">
                  <span className="text-slate-600">
                    {lang === "en" ? "Open" : "未完了"}{" "}
                    <strong className="text-slate-900 font-bold">{summary.openTaskCount}</strong>
                  </span>
                  <span className="text-slate-300">·</span>
                  <span className={summary.overdueNaCount > 0 ? "text-red-600 font-semibold" : "text-slate-500"}>
                    {lang === "en" ? "Overdue" : "期限切れ"}{" "}
                    <strong className="font-bold">{summary.overdueNaCount}</strong>
                  </span>
                  <span className="text-slate-300">·</span>
                  <span className="text-slate-600">
                    {lang === "en" ? "This week" : "今週"}{" "}
                    <strong className="text-slate-900 font-bold">{summary.dueThisWeekNaCount}</strong>
                  </span>
                </div>

                {/* 直近の NA */}
                <div className="mb-4">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    {lang === "en" ? "Next Action" : "直近の NA"}
                  </div>
                  {nearestTask ? (
                    <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-2.5 text-xs">
                      <p className="font-medium text-slate-800 line-clamp-1" title={nearestTask.nextAction}>
                        {nearestTask.nextAction}
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-slate-400" />
                          {parseFuzzyDate(nearestTask.naDue).dateString || nearestTask.naDue}
                        </span>
                        <span>·</span>
                        <span>{nearestOwnerName}</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic py-1">{t("board.no_open_na")}</p>
                  )}
                </div>
              </div>

              {/* 役職詳細リンク */}
              <div className="pt-2 border-t border-slate-100 flex justify-end">
                <Link
                  href={`/roles/${role.roleId}`}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 transition"
                >
                  <span>{lang === "en" ? "View Details" : "役職詳細"}</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

