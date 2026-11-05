"use client";

import React, { useState } from "react";
import { useDashboard } from "@/context/DashboardContext";
import { getOverdueTasks, getDueThisWeekTasks, getStaleTasks } from "@/lib/services";
import { TaskCard } from "@/components/TaskCard";
import { getTodayJST, parseFuzzyDate } from "@/lib/time";
import { AlertTriangle, Calendar, Clock, Inbox } from "lucide-react";

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
      color: "text-red-600",
      bgColor: "bg-red-50 border-red-200",
      icon: AlertTriangle,
    },
    {
      id: "week",
      label: t("alerts.metric_due_week"),
      count: dueWeekTasks.length,
      color: "text-amber-600",
      bgColor: "bg-amber-50 border-amber-200",
      icon: Calendar,
    },
    {
      id: "stale",
      label: t("alerts.metric_stale"),
      count: staleTasks.length,
      color: "text-slate-700",
      bgColor: "bg-slate-50 border-slate-200",
      icon: Clock,
    },
    {
      id: "pending",
      label: t("alerts.metric_pending_req"),
      count: pendingRequests.length,
      color: "text-blue-700",
      bgColor: "bg-blue-50 border-blue-200",
      icon: Inbox,
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
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* ページタイトル */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-800">{t("alerts.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("alerts.subtitle")}</p>
      </div>

      {/* 4つの集計メトリクスカード */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {metrics.map((m) => {
          const Icon = m.icon;
          const isSelected = activeTab === m.id;
          return (
            <div
              key={m.id}
              onClick={() => setActiveTab(m.id as any)}
              className={`rounded-2xl border p-5 cursor-pointer transition select-none ${
                isSelected
                  ? `${m.bgColor} ring-2 ring-blue-500 shadow-sm`
                  : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-xs"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500">{m.label}</span>
                <Icon className={`h-4 w-4 ${m.color}`} />
              </div>
              <div className="flex items-baseline gap-1">
                <span className={`text-3xl font-extrabold ${m.color}`}>{m.count}</span>
                <span className="text-xs text-slate-400 font-medium">件</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* タスク一覧 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <h2 className="text-base font-bold text-slate-800">
            {metrics.find((m) => m.id === activeTab)?.label} ({currentTasks.length})
          </h2>
        </div>

        {currentTasks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center text-sm text-slate-400">
            {t("alerts.empty_section")}
          </div>
        ) : (
          <div className="space-y-3">
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

