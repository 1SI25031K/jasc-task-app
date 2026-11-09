"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useDashboard } from "@/context/DashboardContext";
import { calcCompletionRate, formatCompletionRate, calcMemberAutoLoad, getLatestCheckin } from "@/lib/services";
import { TaskCard } from "@/components/TaskCard";
import { Avatar } from "@/components/Avatar";
import { MaterialIcon } from "@/components/MaterialIcon";
import { getTodayJST, parseFuzzyDate } from "@/lib/time";
import Link from "next/link";

export default function RoleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const roleIdParam = params.roleId as string;
  const { data, lang, t } = useDashboard();
  const today = getTodayJST();

  const role = data.roles.find((r) => r.roleId === roleIdParam) || data.roles[0];
  const roleName = role ? (lang === "en" && role.nameEn ? role.nameEn : role.name) : roleIdParam;

  // この役職のタスク一覧
  const roleTasks = data.tasks.filter((task) =>
    task.roleIds.split(",").map((s) => s.trim()).includes(role?.roleId || "")
  );

  const openTasks = roleTasks
    .filter((task) => task.status !== "完了")
    .sort((a, b) => {
      const da = parseFuzzyDate(a.naDue).dateString || "9999-99-99";
      const db = parseFuzzyDate(b.naDue).dateString || "9999-99-99";
      if (da !== db) return da.localeCompare(db);
      return a.taskId.localeCompare(b.taskId);
    });

  const doneTasks = roleTasks
    .filter((task) => task.status === "完了")
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt));

  // 担当メンバー
  const assignments = data.roleAssignments.filter((ra) => ra.roleId === role?.roleId);
  const memberMap = new Map(data.members.map((m) => [m.memberId, m]));

  const completionRate = calcCompletionRate(roleTasks);
  const rateText = formatCompletionRate(completionRate);

  const [showDone, setShowDone] = useState(false);

  if (!role) {
    return (
      <div className="py-8">
        <p className="text-[#747775]">役職が見つかりませんでした。</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ナビゲーション戻るボタン & 役職切替セレクト */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/board"
            aria-label="役職ボードに戻る"
            className="flex h-10 w-10 items-center justify-center rounded-full text-[#444746] hover:bg-[#F3EDF7] transition"
          >
            <MaterialIcon name="arrow_back" className="text-xl" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-normal tracking-tight text-[#1F1F1F]">{roleName}</h1>
              <span className="rounded-[8px] bg-[#F3EDF7] px-2 py-0.5 text-xs text-[#444746]">
                {role.category}
              </span>
            </div>
          </div>
        </div>

        {/* 役職クイック切替 */}
        <select
          value={role.roleId}
          onChange={(e) => router.push(`/roles/${e.target.value}`)}
          className="h-10 rounded-[8px] border border-[#747775] bg-white px-3 text-xs sm:text-sm font-medium text-[#1F1F1F] focus:border-[#0B57D0] focus:outline-none"
        >
          {data.roles.filter((r) => r.active).map((r) => (
            <option key={r.roleId} value={r.roleId}>
              {lang === "en" && r.nameEn ? r.nameEn : r.name} ({r.category})
            </option>
          ))}
        </select>
      </div>

      {/* 上部サマリーカード: 完了率 ＆ 担当メンバー */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* 完了率カード */}
        <div className="rounded-[28px] border border-[#C4C7C5]/40 bg-white p-5 shadow-xs flex flex-col justify-between">
          <div>
            <span className="text-xs font-medium text-[#747775] tracking-wider">
              {lang === "en" ? "COMPLETION RATE" : "完了率"}
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-normal text-[#1F1F1F]">{rateText}</span>
              <span className="text-xs text-[#747775]">
                ({doneTasks.length} / {roleTasks.length} {lang === "en" ? "tasks" : "件完了"})
              </span>
            </div>
            {/* プログレスバー */}
            <div className="mt-4 h-2 w-full rounded-full bg-[#F3EDF7] overflow-hidden">
              <div
                className="h-full bg-[#0B57D0] rounded-full transition-all duration-300"
                style={{ width: `${Math.round((completionRate ?? 0) * 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* 担当メンバーカード */}
        <div className="md:col-span-2 rounded-[28px] border border-[#C4C7C5]/40 bg-white p-5 shadow-xs">
          <div className="flex items-center gap-2 mb-3">
            <MaterialIcon name="group" className="text-base text-[#747775]" />
            <h2 className="text-xs font-medium text-[#747775] tracking-wider">
              {lang === "en" ? "ASSIGNED MEMBERS" : "担当メンバー"}
            </h2>
          </div>

          {assignments.length === 0 ? (
            <p className="text-xs text-[#747775] italic">{t("role_detail.no_members")}</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {assignments.map((ra) => {
                const m = memberMap.get(ra.memberId);
                if (!m) return null;
                const mName = lang === "en" && m.displayNameEn ? m.displayNameEn : m.displayName;
                const autoPt = calcMemberAutoLoad(m.memberId, data.tasks, today);
                const { checkin } = getLatestCheckin(m.memberId, data.checkins, today);

                return (
                  <div
                    key={`${ra.roleId}-${ra.memberId}`}
                    className="flex items-center justify-between gap-2 rounded-[16px] border border-[#C4C7C5]/30 bg-[#F8F9FA] p-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar name={mName} memberId={m.memberId} size={32} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-[#1F1F1F] truncate">{mName}</span>
                          <span className="rounded-[4px] bg-[#F3EDF7] px-1.5 py-0.2 text-[10px] text-[#444746] shrink-0">
                            {ra.kind}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#747775] mt-0.5">
                          {lang === "en" ? `Auto: ${autoPt}pt` : `自動: ${autoPt}pt`}
                          {" · "}
                          {checkin ? (
                            <span>{lang === "en" ? `Score: ${checkin.score}` : `体感: ${checkin.score}`}</span>
                          ) : (
                            <span className="text-[#747775]">{lang === "en" ? "Unanswered" : "未回答"}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 未完了タスク一覧（M3 List） */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <MaterialIcon name="format_list_bulleted" className="text-base text-[#747775]" />
          <h2 className="text-base font-normal text-[#1F1F1F]">
            {lang === "en" ? "Open Tasks" : "未完了タスク"} ({openTasks.length})
          </h2>
        </div>

        {openTasks.length === 0 ? (
          <div className="rounded-[16px] border border-dashed border-[#C4C7C5] p-8 text-center text-sm text-[#747775]">
            {t("role_detail.no_open_tasks")}
          </div>
        ) : (
          <div className="rounded-[28px] border border-[#C4C7C5]/40 bg-white overflow-hidden shadow-xs">
            {openTasks.map((task) => (
              <TaskCard
                key={task.taskId}
                task={task}
                members={data.members}
                roles={data.roles}
                lang={lang}
              />
            ))}
          </div>
        )}
      </div>

      {/* 完了タスク一覧（折りたたみ） */}
      {doneTasks.length > 0 && (
        <div className="pt-2">
          <button
            onClick={() => setShowDone(!showDone)}
            className="flex items-center gap-2 text-sm font-medium text-[#444746] hover:text-[#1F1F1F] transition"
          >
            <MaterialIcon name="check_circle" className="text-base text-[#146C2E]" />
            <span>
              {lang === "en" ? "Completed Tasks" : "完了したタスク"} ({doneTasks.length})
            </span>
            <span className="text-xs text-[#0B57D0] hover:underline ml-1">
              {showDone ? (lang === "en" ? "Hide" : "非表示") : (lang === "en" ? "Show" : "表示する")}
            </span>
          </button>

          {showDone && (
            <div className="mt-3 rounded-[28px] border border-[#C4C7C5]/40 bg-white overflow-hidden shadow-xs">
              {doneTasks.map((task) => (
                <TaskCard
                  key={task.taskId}
                  task={task}
                  members={data.members}
                  roles={data.roles}
                  lang={lang}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
