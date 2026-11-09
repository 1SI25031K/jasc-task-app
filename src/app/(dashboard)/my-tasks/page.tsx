"use client";

import React, { useState } from "react";
import { useDashboard } from "@/context/DashboardContext";
import { calcMemberAutoLoad, getLatestCheckin } from "@/lib/services";
import { TaskCard } from "@/components/TaskCard";
import { getTodayJST, parseFuzzyDate } from "@/lib/time";
import { MaterialIcon } from "@/components/MaterialIcon";
import Link from "next/link";

export default function MyTasksPage() {
  const { data, currentMember, lang, t } = useDashboard();
  const [activeTab, setActiveTab] = useState<"active" | "pending" | "waiting" | "done">("active");
  const today = getTodayJST();

  // ログイン中メンバーのタスク
  const myTasks = data.tasks.filter(
    (task) => !task.archived && task.ownerMemberId === currentMember.memberId
  );

  // 1. 承諾済・進行中・未着手
  const activeTasks = myTasks
    .filter((task) => ["進行中", "未着手"].includes(task.status) && task.assignmentStatus === "承諾済")
    .sort((a, b) => {
      const da = parseFuzzyDate(a.naDue).dateString || "9999-99-99";
      const db = parseFuzzyDate(b.naDue).dateString || "9999-99-99";
      if (da !== db) return da.localeCompare(db);
      return a.taskId.localeCompare(b.taskId);
    });

  // 2. 依頼中・相談中
  const pendingTasks = myTasks
    .filter((task) => task.status !== "完了" && ["依頼中", "相談中"].includes(task.assignmentStatus))
    .sort((a, b) => {
      const da = parseFuzzyDate(a.naDue).dateString || "9999-99-99";
      const db = parseFuzzyDate(b.naDue).dateString || "9999-99-99";
      if (da !== db) return da.localeCompare(db);
      return a.taskId.localeCompare(b.taskId);
    });

  // 3. 待ち
  const waitingTasks = myTasks
    .filter((task) => ["待ち", "確認待ち"].includes(task.status))
    .sort((a, b) => {
      const da = parseFuzzyDate(a.naDue).dateString || "9999-99-99";
      const db = parseFuzzyDate(b.naDue).dateString || "9999-99-99";
      if (da !== db) return da.localeCompare(db);
      return a.taskId.localeCompare(b.taskId);
    });

  // 4. 完了
  const doneTasks = myTasks
    .filter((task) => task.status === "完了")
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt));

  // 負荷サマリー
  const totalAutoPt = calcMemberAutoLoad(currentMember.memberId, data.tasks, today);
  const { checkin } = getLatestCheckin(currentMember.memberId, data.checkins, today);

  const tabs = [
    { id: "active", label: t("my_tasks.tab_active", { count: activeTasks.length }), count: activeTasks.length, icon: "check_circle" },
    { id: "pending", label: t("my_tasks.tab_pending_requests", { count: pendingTasks.length }), count: pendingTasks.length, icon: "inbox" },
    { id: "waiting", label: t("my_tasks.tab_waiting", { count: waitingTasks.length }), count: waitingTasks.length, icon: "schedule" },
    { id: "done", label: t("my_tasks.tab_done", { count: doneTasks.length }), count: doneTasks.length, icon: "task_alt" },
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
    <div className="space-y-6">
      {/* ページタイトル */}
      <div>
        <h1 className="text-2xl font-normal tracking-tight text-on-surface">{t("my_tasks.title")}</h1>
      </div>

      {/* 負荷サマリーカード: 白背景・角丸28px・枠線なし・影なし (M3 Level 0) */}
      <div className="rounded-[28px] bg-surface-container-lowest p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <div>
            <span className="text-xs font-medium text-on-surface-variant tracking-wider">
              {lang === "en" ? "AUTO LOAD" : "現在の自動負荷"}
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-2xl font-normal text-on-surface">{totalAutoPt}</span>
              <span className="text-xs text-on-surface-variant">pt</span>
            </div>
          </div>

          <div className="h-8 w-px bg-outline-variant/40" />

          <div>
            <span className="text-xs font-medium text-on-surface-variant tracking-wider">
              {lang === "en" ? "LATEST CHECK-IN" : "直近の体感負荷"}
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              {checkin ? (
                <>
                  <span className="text-2xl font-normal text-primary">{checkin.score}</span>
                  <span className="text-xs text-on-surface-variant">/ 10</span>
                </>
              ) : (
                <span className="text-sm font-normal text-on-surface-variant">{lang === "en" ? "Unanswered" : "未回答"}</span>
              )}
            </div>
          </div>
        </div>

        <Link
          href="/checkin"
          className="m3-interactive h-9 px-4 rounded-full bg-surface-container-lowest border border-outline text-on-surface hover:bg-surface-container-low text-xs font-medium transition inline-flex items-center"
        >
          {lang === "en" ? "Submit Check-in" : "体感負荷を回答する"}
        </Link>
      </div>

      {/* M3 Primary Tabs */}
      <div
        role="tablist"
        aria-label="タスク分類"
        className="flex border-b border-outline-variant/30 space-x-2 overflow-x-auto no-scrollbar"
      >
        {tabs.map((tab) => {
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isSelected}
              onClick={() => setActiveTab(tab.id as any)}
              className={`m3-interactive m3-tab flex items-center gap-2 border-b-2 py-3 px-4 text-sm font-medium transition shrink-0 ${
                isSelected
                  ? "border-primary text-primary"
                  : "border-transparent text-on-surface-variant hover:text-on-surface"
              }`}
            >
              <MaterialIcon name={tab.icon} size={18} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* タスクリスト（M3 List: 白背景・角丸28px・枠線なし・影なし・showOwner={false}） */}
      {currentTabTasks.length === 0 ? (
        <div className="rounded-[16px] border border-dashed border-outline-variant p-12 text-center text-sm text-on-surface-variant">
          {t("my_tasks.empty_tab")}
        </div>
      ) : (
        <div className="rounded-[28px] bg-surface-container-lowest overflow-hidden">
          {currentTabTasks.map((task) => (
            <TaskCard
              key={task.taskId}
              task={task}
              members={data.members}
              roles={data.roles}
              lang={lang}
              showOwner={false}
            />
          ))}
        </div>
      )}
    </div>
  );
}
