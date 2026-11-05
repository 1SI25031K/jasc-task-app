"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useDashboard } from "@/context/DashboardContext";
import { calcCompletionRate, formatCompletionRate, calcMemberAutoLoad, getLatestCheckin } from "@/lib/services";
import { TaskCard } from "@/components/TaskCard";
import { Avatar } from "@/components/Avatar";
import { getTodayJST, parseFuzzyDate } from "@/lib/time";
import { ArrowLeft, CheckCircle2, ListTodo, Users } from "lucide-react";
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
  const roleTasks = data.tasks.filter((t) =>
    t.roleIds.split(",").map((s) => s.trim()).includes(role?.roleId || "")
  );

  const openTasks = roleTasks
    .filter((t) => t.status !== "完了")
    .sort((a, b) => {
      const da = parseFuzzyDate(a.naDue).dateString || "9999-99-99";
      const db = parseFuzzyDate(b.naDue).dateString || "9999-99-99";
      if (da !== db) return da.localeCompare(db);
      return a.taskId.localeCompare(b.taskId);
    });

  const doneTasks = roleTasks
    .filter((t) => t.status === "完了")
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt));

  // 担当メンバー
  const assignments = data.roleAssignments.filter((ra) => ra.roleId === role?.roleId);
  const memberMap = new Map(data.members.map((m) => [m.memberId, m]));

  const completionRate = calcCompletionRate(roleTasks);
  const rateText = formatCompletionRate(completionRate);

  const [showDone, setShowDone] = useState(false);

  if (!role) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <p className="text-slate-500">役職が見つかりませんでした。</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* ナビゲーション戻るボタン & 役職切替セレクト */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <Link
            href="/board"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-slate-800">{roleName}</h1>
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                {role.category}
              </span>
            </div>
          </div>
        </div>

        {/* 役職クイック切替 */}
        <select
          value={role.roleId}
          onChange={(e) => router.push(`/roles/${e.target.value}`)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm font-medium text-slate-700 shadow-xs focus:border-blue-500 focus:outline-none"
        >
          {data.roles.filter((r) => r.active).map((r) => (
            <option key={r.roleId} value={r.roleId}>
              {lang === "en" && r.nameEn ? r.nameEn : r.name} ({r.category})
            </option>
          ))}
        </select>
      </div>

      {/* 上部サマリーカード: 完了率 ＆ 担当メンバー */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* 完了率カード */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs flex flex-col justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {lang === "en" ? "Completion Rate" : "完了率"}
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold tracking-tight text-slate-900">{rateText}</span>
              <span className="text-xs text-slate-500">
                ({doneTasks.length} / {roleTasks.length} {lang === "en" ? "tasks" : "件完了"})
              </span>
            </div>
            {/* プログレスバー */}
            <div className="mt-4 h-2 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all duration-300"
                style={{ width: `${Math.round((completionRate ?? 0) * 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* 担当メンバーカード */}
        <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
              {lang === "en" ? "Assigned Members" : "担当メンバー"}
            </h2>
          </div>

          {assignments.length === 0 ? (
            <p className="text-xs text-slate-400 italic">{t("role_detail.no_members")}</p>
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
                    className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/70 p-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar name={mName} memberId={m.memberId} size={32} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-800 truncate">{mName}</span>
                          <span className="rounded bg-slate-200 px-1.5 py-0.2 text-[10px] font-medium text-slate-700 shrink-0">
                            {ra.kind}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {lang === "en" ? `Auto: ${autoPt}pt` : `自動: ${autoPt}pt`}
                          {" · "}
                          {checkin ? (
                            <span>{lang === "en" ? `Score: ${checkin.score}` : `体感: ${checkin.score}`}</span>
                          ) : (
                            <span className="text-slate-400">{lang === "en" ? "Unanswered" : "未回答"}</span>
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

      {/* 未完了タスク一覧 */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ListTodo className="h-5 w-5 text-slate-600" />
            <h2 className="text-lg font-bold text-slate-800">
              {lang === "en" ? "Open Tasks" : "未完了タスク"} ({openTasks.length})
            </h2>
          </div>
        </div>

        {openTasks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
            {t("role_detail.no_open_tasks")}
          </div>
        ) : (
          <div className="space-y-3">
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
        <div className="pt-4 border-t border-slate-200">
          <button
            onClick={() => setShowDone(!showDone)}
            className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900 transition"
          >
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>
              {lang === "en" ? "Completed Tasks" : "完了したタスク"} ({doneTasks.length})
            </span>
            <span className="text-xs text-blue-600 hover:underline">
              {showDone ? (lang === "en" ? "Hide" : "非表示") : (lang === "en" ? "Show" : "表示する")}
            </span>
          </button>

          {showDone && (
            <div className="mt-4 space-y-3">
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

