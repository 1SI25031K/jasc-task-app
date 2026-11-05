"use client";

import React, { useState } from "react";
import { useDashboard } from "@/context/DashboardContext";
import { TaskCard } from "@/components/TaskCard";
import { parseFuzzyDate } from "@/lib/time";
import { Inbox, Send, ListFilter } from "lucide-react";

export default function InboxPage() {
  const { data, currentMember, lang, t } = useDashboard();
  const [activeTab, setActiveTab] = useState<"to_me" | "from_me" | "all">("to_me");

  // 1. 自分への依頼
  const toMeRequests = data.tasks
    .filter(
      (task) =>
        !task.archived &&
        task.status !== "完了" &&
        task.ownerMemberId === currentMember.memberId &&
        ["依頼中", "相談中"].includes(task.assignmentStatus) &&
        task.requestedBy !== currentMember.memberId
    )
    .sort((a, b) => {
      const da = parseFuzzyDate(a.naDue).dateString || "9999-99-99";
      const db = parseFuzzyDate(b.naDue).dateString || "9999-99-99";
      if (da !== db) return da.localeCompare(db);
      return a.taskId.localeCompare(b.taskId);
    });

  // 2. 自分が依頼中
  const fromMeRequests = data.tasks
    .filter(
      (task) =>
        !task.archived &&
        task.status !== "完了" &&
        task.requestedBy === currentMember.memberId &&
        ["依頼中", "相談中"].includes(task.assignmentStatus) &&
        task.ownerMemberId !== currentMember.memberId
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  // 3. 全体の依頼
  const allRequests = data.tasks
    .filter(
      (task) =>
        !task.archived &&
        task.status !== "完了" &&
        ["依頼中", "相談中"].includes(task.assignmentStatus)
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const tabs = [
    {
      id: "to_me",
      label: lang === "en" ? `Requests to Me (${toMeRequests.length})` : `自分宛ての依頼 (${toMeRequests.length})`,
      count: toMeRequests.length,
      icon: Inbox,
    },
    {
      id: "from_me",
      label: lang === "en" ? `Sent by Me (${fromMeRequests.length})` : `自分が依頼中 (${fromMeRequests.length})`,
      count: fromMeRequests.length,
      icon: Send,
    },
    {
      id: "all",
      label: lang === "en" ? `All Pending (${allRequests.length})` : `全体の依頼・相談 (${allRequests.length})`,
      count: allRequests.length,
      icon: ListFilter,
    },
  ] as const;

  const currentTasks =
    activeTab === "to_me"
      ? toMeRequests
      : activeTab === "from_me"
      ? fromMeRequests
      : allRequests;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* ページタイトル */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-800">{t("inbox.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("inbox.subtitle")}</p>
      </div>

      {/* タブ切替 */}
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

      {/* タスク一覧 */}
      {currentTasks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center text-sm text-slate-400">
          {t("inbox.empty_inbox")}
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
  );
}

