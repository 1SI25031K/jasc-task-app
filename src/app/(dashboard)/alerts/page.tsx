"use client";

import React, { useState } from "react";
import { useDashboard } from "@/context/DashboardContext";
import { getOverdueTasks, getDueThisWeekTasks, getStaleTasks } from "@/lib/services";
import { TaskCard } from "@/components/TaskCard";
import { getTodayJST, parseFuzzyDate } from "@/lib/time";
import { MaterialIcon } from "@/components/MaterialIcon";

export default function AlertsPage() {
  const { data, lang, t } = useDashboard();
  const [activeTab, setActiveTab] = useState<"overdue" | "week" | "stale" | "pending">("overdue");
  const today = getTodayJST();

  const overdueTasks = getOverdueTasks(data.tasks, today);
  const dueWeekTasks = getDueThisWeekTasks(data.tasks, today);
  const staleTasks = getStaleTasks(data.tasks, 7);

  // 返事のない依頼（依頼中 かつ 3日以上経過）
  const pendingRequests = data.tasks.filter((task) => {
    if (task.status === "完了" || task.assignmentStatus !== "依頼中") return false;
    const { dateString } = parseFuzzyDate(task.updatedAt);
    if (!dateString) return false;
    const [y, m, d] = dateString.split("-").map(Number);
    const updatedDate = new Date(Date.UTC(y, m - 1, d));
    const [ty, tm, td] = today.split("-").map(Number);
    const todayDate = new Date(Date.UTC(ty, tm - 1, td));
    const diffDays = (todayDate.getTime() - updatedDate.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays >= 3;
  });

  const metrics = [
    {
      id: "overdue",
      label: t("alerts.metric_overdue"),
      count: overdueTasks.length,
      color: "text-error",
      icon: "warning",
    },
    {
      id: "week",
      label: t("alerts.metric_due_week"),
      count: dueWeekTasks.length,
      color: "text-on-surface-variant",
      icon: "calendar_today",
    },
    {
      id: "stale",
      label: t("alerts.metric_stale"),
      count: staleTasks.length,
      color: "text-on-surface-variant",
      icon: "schedule",
    },
    {
      id: "pending",
      label: t("alerts.metric_pending_req"),
      count: pendingRequests.length,
      color: "text-primary",
      icon: "inbox",
    },
  ] as const;

  const currentTasks =
    activeTab === "overdue"
      ? overdueTasks
      : activeTab === "week"
      ? dueWeekTasks
      : activeTab === "stale"
      ? staleTasks
      : pendingRequests;

  return (
    <div className="space-y-6">
      {/* ページタイトル */}
      <div>
        <h1 className="text-2xl font-normal tracking-tight text-on-surface">{t("alerts.title")}</h1>
        <p className="mt-1 text-sm text-on-surface-variant">{t("alerts.subtitle")}</p>
      </div>

      {/* 4つの集計メトリクスカード（Level 0 flat, radius 28px, 枠線なし, 影なし） */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((m) => {
          const isSelected = activeTab === m.id;
          return (
            <div
              key={m.id}
              onClick={() => setActiveTab(m.id as any)}
              className={`rounded-[28px] border-none shadow-none p-5 cursor-pointer transition select-none m3-interactive ${
                isSelected
                  ? "bg-secondary-container ring-2 ring-primary"
                  : "bg-surface-container-lowest hover:bg-surface-container-low"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-on-surface-variant">{m.label}</span>
                <MaterialIcon name={m.icon} className={`text-base ${m.color}`} />
              </div>
              <div className="flex items-baseline gap-1">
                <span className={`text-3xl font-normal ${m.color}`}>{m.count}</span>
                <span className="text-xs text-on-surface-variant">件</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* タスク一覧（M3 List） */}
      <div>
        <div className="flex items-center justify-between pb-3">
          <h2 className="text-base font-medium text-on-surface">
            {metrics.find((m) => m.id === activeTab)?.label} ({currentTasks.length})
          </h2>
        </div>

        {currentTasks.length === 0 ? (
          <div className="rounded-[16px] border border-dashed border-outline-variant p-12 text-center text-sm text-on-surface-variant">
            {t("alerts.empty_section")}
          </div>
        ) : (
          <div className="rounded-[28px] bg-surface-container-lowest border-none shadow-none overflow-hidden">
            {currentTasks.map((task) => (
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
    </div>
  );
}
