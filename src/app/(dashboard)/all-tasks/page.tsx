"use client";

import React, { useState, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useDashboard } from "@/context/DashboardContext";
import { TaskCard } from "@/components/TaskCard";
import { parseFuzzyDate } from "@/lib/time";
import { Search, Filter, RotateCcw } from "lucide-react";

function AllTasksContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";
  const { data, lang, t } = useDashboard();

  const [keyword, setKeyword] = useState(initialQuery);
  const [selectedRole, setSelectedRole] = useState("");
  const [selectedOwner, setSelectedOwner] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [selectedAssignment, setSelectedAssignment] = useState("");
  const [sortBy, setSortBy] = useState<"due_asc" | "due_desc" | "updated_desc">("due_asc");
  const [showArchived, setShowArchived] = useState(false);

  const filteredTasks = useMemo(() => {
    return data.tasks.filter((task) => {
      if (!showArchived && task.archived) return false;
      if (showArchived && !task.archived) return false;

      if (selectedRole) {
        const rids = task.roleIds.split(",").map((s) => s.trim());
        if (!rids.includes(selectedRole)) return false;
      }

      if (selectedOwner && task.ownerMemberId !== selectedOwner) {
        return false;
      }

      if (selectedStatus && task.status !== selectedStatus) {
        return false;
      }

      if (selectedAssignment && task.assignmentStatus !== selectedAssignment) {
        return false;
      }

      if (keyword.trim()) {
        const kw = keyword.toLowerCase().trim();
        const inTitle = task.title.toLowerCase().includes(kw);
        const inNA = task.nextAction.toLowerCase().includes(kw);
        const inNotes = task.notes.toLowerCase().includes(kw);
        if (!inTitle && !inNA && !inNotes) return false;
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === "due_asc") {
        const da = parseFuzzyDate(a.naDue).dateString || "9999-99-99";
        const db = parseFuzzyDate(b.naDue).dateString || "9999-99-99";
        if (da !== db) return da.localeCompare(db);
        return a.taskId.localeCompare(b.taskId);
      }
      if (sortBy === "due_desc") {
        const da = parseFuzzyDate(a.naDue).dateString || "0000-00-00";
        const db = parseFuzzyDate(b.naDue).dateString || "0000-00-00";
        if (da !== db) return db.localeCompare(da);
        return b.taskId.localeCompare(a.taskId);
      }
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [data.tasks, keyword, selectedRole, selectedOwner, selectedStatus, selectedAssignment, sortBy, showArchived]);

  const resetFilters = () => {
    setKeyword("");
    setSelectedRole("");
    setSelectedOwner("");
    setSelectedStatus("");
    setSelectedAssignment("");
    setSortBy("due_asc");
    setShowArchived(false);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* ページタイトル */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">{t("all_tasks.title")}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {t("all_tasks.result_count", { count: filteredTasks.length })}
          </p>
        </div>

        {/* フィルターリセット */}
        {(keyword || selectedRole || selectedOwner || selectedStatus || selectedAssignment || showArchived) && (
          <button
            onClick={resetFilters}
            className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 transition"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>{lang === "en" ? "Reset filters" : "フィルターを解除"}</span>
          </button>
        )}
      </div>

      {/* 検索・絞り込みパネル */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs mb-8 space-y-4">
        {/* キーワード検索 */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={t("all_tasks.filter_keyword")}
            className="w-full rounded-xl border border-slate-300 bg-slate-50/50 py-2.5 pl-10 pr-4 text-sm text-slate-800 focus:bg-white focus:border-blue-500 focus:outline-none transition"
          />
        </div>

        {/* セレクトフィルター群 */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 text-xs">
          {/* 役職 */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">{t("all_tasks.filter_role")}</label>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-slate-700 focus:border-blue-500 focus:outline-none"
            >
              <option value="">{t("common.all")}</option>
              {data.roles.filter((r) => r.active).map((r) => (
                <option key={r.roleId} value={r.roleId}>
                  {lang === "en" && r.nameEn ? r.nameEn : r.name}
                </option>
              ))}
            </select>
          </div>

          {/* 担当者 */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">{t("all_tasks.filter_owner")}</label>
            <select
              value={selectedOwner}
              onChange={(e) => setSelectedOwner(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-slate-700 focus:border-blue-500 focus:outline-none"
            >
              <option value="">{t("common.all")}</option>
              {data.members.filter((m) => m.active).map((m) => (
                <option key={m.memberId} value={m.memberId}>
                  {lang === "en" && m.displayNameEn ? m.displayNameEn : m.displayName}
                </option>
              ))}
            </select>
          </div>

          {/* ステータス */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">{t("all_tasks.filter_status")}</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-slate-700 focus:border-blue-500 focus:outline-none"
            >
              <option value="">{t("common.all")}</option>
              <option value="未着手">未着手</option>
              <option value="進行中">進行中</option>
              <option value="確認待ち">確認待ち</option>
              <option value="完了">完了</option>
            </select>
          </div>

          {/* 依頼状態 */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">{t("all_tasks.filter_assignment")}</label>
            <select
              value={selectedAssignment}
              onChange={(e) => setSelectedAssignment(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-slate-700 focus:border-blue-500 focus:outline-none"
            >
              <option value="">{t("common.all")}</option>
              <option value="承諾済">承諾済</option>
              <option value="依頼中">依頼中</option>
              <option value="相談中">相談中</option>
            </select>
          </div>

          {/* 並び順 */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">{lang === "en" ? "Sort" : "並び替え"}</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-slate-700 focus:border-blue-500 focus:outline-none"
            >
              <option value="due_asc">{lang === "en" ? "Due Date (Asc)" : "NA期限が早い順"}</option>
              <option value="due_desc">{lang === "en" ? "Due Date (Desc)" : "NA期限が遅い順"}</option>
              <option value="updated_desc">{lang === "en" ? "Recently Updated" : "更新が新しい順"}</option>
            </select>
          </div>
        </div>

        {/* アーカイブ表示チェックボックス */}
        <div className="flex items-center gap-2 pt-2 border-t border-slate-100 text-xs">
          <input
            type="checkbox"
            id="showArchived"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="rounded text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
          />
          <label htmlFor="showArchived" className="text-slate-600 cursor-pointer">
            {t("all_tasks.filter_show_archived")}
          </label>
        </div>
      </div>

      {/* タスク一覧 */}
      {filteredTasks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center text-sm text-slate-400">
          {t("alerts.empty_section")}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTasks.map((task) => (
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

export default function AllTasksPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-400">Loading tasks...</div>}>
      <AllTasksContent />
    </Suspense>
  );
}

