"use client";

import React, { useState } from "react";
import { useDashboard } from "@/context/DashboardContext";
import { calcMemberAutoLoad, getLatestCheckin } from "@/lib/services";
import { TaskCard } from "@/components/TaskCard";
import { getTodayJST, parseFuzzyDate } from "@/lib/time";
import { CheckSquare, Clock, Inbox, CheckCircle2, AlertCircle } from "lucide-react";
import Link from "next/link";

export default function MyTasksPage() {
  const { data, currentMember, lang, t } = useDashboard();
  const [activeTab, setActiveTab] = useState<"active" | "pending" | "waiting" | "done">("active");
  const today = getTodayJST();

  // ログイン中メンバーのタスク
  const myTasks = data.tasks.filter(
    (t) => !t.archived && t.ownerMemberId === currentMember.memberId
  );

  // 1. 承諾済・進行中・未着手
  const activeTasks = myTasks
    .filter((t) => ["進行中", "未着手"].includes(t.status) && t.assignmentStatus === "承諾済")
    .sort((a, b) => {
      const da = parseFuzzyDate(a.naDue).dateString || "9999-99-99";
      const db = parseFuzzyDate(b.naDue).dateString || "9999-99-99";
      if (da !== db) return da.localeCompare(db);
      return a.taskId.localeCompare(b.taskId);
    });

  // 2. 依頼中・相談中
  const pendingTasks = myTasks
    .filter((t) => t.status !== "完了" && ["依頼中", "相談中"].includes(t.assignmentStatus))
    .sort((a, b) => {
      const da = parseFuzzyDate(a.naDue).dateString || "9999-99-99";
      const db = parseFuzzyDate(b.naDue).dateString || "9999-99-99";
      if (da !== db) return da.localeCompare(db);
      return a.taskId.localeCompare(b.taskId);
    });

  // 3. 待ち
  const waitingTasks = myTasks
    .filter((t) => ["待ち", "確認待ち"].includes(t.status))
    .sort((a, b) => {
      const da = parseFuzzyDate(a.naDue).dateString || "9999-99-99";
      const db = parseFuzzyDate(b.naDue).dateString || "9999-99-99";
      if (da !== db) return da.localeCompare(db);
      return a.taskId.localeCompare(b.taskId);
    });

  // 4. 完了
  const doneTasks = myTasks
    .filter((t) => t.status === "完了")
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt));

  // 負荷サマリー
  const totalAutoPt = calcMemberAutoLoad(currentMember.memberId, data.tasks, today);
  const { checkin } = getLatestCheckin(currentMember.memberId, data.checkins, today);

  const tabs = [
    { id: "active", label: t("my_tasks.tab_active", { count: activeTasks.length }), count: activeTasks.length, icon: CheckSquare },
    { id: "pending", label: t("my_tasks.tab_pending_requests", { count: pendingTasks.length }), count: pendingTasks.length, icon: Inbox },
    { id: "waiting", label: t("my_tasks.tab_waiting", { count: waitingTasks.length }), count: waitingTasks.length, icon: Clock },
    { id: "done", label: t("my_tasks.tab_done", { count: doneTasks.length }), count: doneTasks.length, icon: CheckCircle2 },
  ] as const;

  const currentTabTasks =
    activeTab === "active"
      ? activeTasks
      : activeTab === "pending"
      ? pendingTasks
      : activeTab === "waiting"
      ? waitingTasks
      : doneTasks;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* ページタイトル */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-800">{t("my_tasks.title")}</h1>
      </div>

      {/* 負荷サマリーカード */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              {lang === "en" ? "Auto Load" : "現在の自動負荷"}
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-2xl font-bold text-slate-900">{totalAutoPt}</span>
              <span className="text-xs text-slate-500 font-medium">pt</span>
            </div>
          </div>

          <div className="h-8 w-px bg-slate-200" />

          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              {lang === "en" ? "Latest Check-in" : "直近の体感負荷"}
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              {checkin ? (
                <>
                  <span className="text-2xl font-bold text-slate-900">{checkin.score}</span>
                  <span className="text-xs text-slate-500">/ 10</span>
                </>
              ) : (
                <span className="text-sm font-medium text-slate-400">{lang === "en" ? "Unanswered" : "未回答"}</span>
              )}
            </div>
          </div>
        </div>

        <Link
          href="/checkin"
          className="rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 px-3.5 py-1.5 text-xs font-medium transition"
        >
          {lang === "en" ? "Submit Check-in" : "体感負荷を回答する"}
        </Link>
      </div>

      {/* タブ切り替え（クライアント側即時反映） */}
      <div className="flex border-b border-slate-200 space-x-2 mb-6 overflow-x-auto no-scrollbar">
        {tabs.map((tab) => {
          const isSelected = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 border-b-2 py-3 px-4 text-sm font-semibold transition shrink-0 ${
                isSelected
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* タスクリスト */}
      {currentTabTasks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center text-sm text-slate-400">
          {t("my_tasks.empty_tab")}
        </div>
      ) : (
        <div className="space-y-3">
          {currentTabTasks.map((task) => (
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
  );
}

