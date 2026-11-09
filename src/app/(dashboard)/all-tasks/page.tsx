"use client";

import React, { useState, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useDashboard } from "@/context/DashboardContext";
import { TaskCard } from "@/components/TaskCard";
import { parseFuzzyDate } from "@/lib/time";
import { MaterialIcon } from "@/components/MaterialIcon";

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
    <div className="space-y-6">
      {/* ページタイトル */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-normal tracking-tight text-on-surface">{t("all_tasks.title")}</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            {t("all_tasks.result_count", { count: filteredTasks.length })}
          </p>
        </div>

        {/* フィルターリセット */}
        {(keyword || selectedRole || selectedOwner || selectedStatus || selectedAssignment || showArchived) && (
          <button
            onClick={resetFilters}
            className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline m3-interactive"
          >
            <MaterialIcon name="restart_alt" className="text-base" />
            <span>{lang === "en" ? "Reset filters" : "フィルターを解除"}</span>
          </button>
        )}
      </div>

      {/* 検索・絞り込みパネル（Level 0 flat, 角丸 28px, 枠線なし） */}
      <div className="rounded-[28px] bg-surface-container-lowest p-5 border-none shadow-none space-y-4">
        {/* キーワード検索 */}
        <div className="relative">
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant flex items-center pointer-events-none">
            <MaterialIcon name="search" className="text-xl" />
          </div>
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={t("all_tasks.filter_keyword")}
            className="w-full h-11 rounded-full border-none bg-surface-container-high pl-10 pr-4 text-sm text-on-surface placeholder:text-on-surface-variant focus:bg-surface-container-lowest focus:outline-none focus-visible:ring-2 focus-visible:ring-primary transition"
          />
        </div>

        {/* セレクトフィルター群 */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 text-xs">
          {/* 役職 */}
          <div>
            <label className="block text-[11px] font-medium text-on-surface-variant mb-1">{t("all_tasks.filter_role")}</label>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="w-full h-9 rounded-[8px] border border-outline-variant bg-surface-container-low px-2.5 text-on-surface focus:border-primary focus:bg-surface-container-lowest focus:outline-none"
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
            <label className="block text-[11px] font-medium text-on-surface-variant mb-1">{t("all_tasks.filter_owner")}</label>
            <select
              value={selectedOwner}
              onChange={(e) => setSelectedOwner(e.target.value)}
              className="w-full h-9 rounded-[8px] border border-outline-variant bg-surface-container-low px-2.5 text-on-surface focus:border-primary focus:bg-surface-container-lowest focus:outline-none"
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
            <label className="block text-[11px] font-medium text-on-surface-variant mb-1">{t("all_tasks.filter_status")}</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full h-9 rounded-[8px] border border-outline-variant bg-surface-container-low px-2.5 text-on-surface focus:border-primary focus:bg-surface-container-lowest focus:outline-none"
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
            <label className="block text-[11px] font-medium text-on-surface-variant mb-1">{t("all_tasks.filter_assignment")}</label>
            <select
              value={selectedAssignment}
              onChange={(e) => setSelectedAssignment(e.target.value)}
              className="w-full h-9 rounded-[8px] border border-outline-variant bg-surface-container-low px-2.5 text-on-surface focus:border-primary focus:bg-surface-container-lowest focus:outline-none"
            >
              <option value="">{t("common.all")}</option>
              <option value="承諾済">承諾済</option>
              <option value="依頼中">依頼中</option>
              <option value="相談中">相談中</option>
            </select>
          </div>

          {/* 並び順 */}
          <div>
            <label className="block text-[11px] font-medium text-on-surface-variant mb-1">{lang === "en" ? "Sort" : "並び替え"}</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="w-full h-9 rounded-[8px] border border-outline-variant bg-surface-container-low px-2.5 text-on-surface focus:border-primary focus:bg-surface-container-lowest focus:outline-none"
            >
              <option value="due_asc">{lang === "en" ? "Due Date (Asc)" : "NA期限が早い順"}</option>
              <option value="due_desc">{lang === "en" ? "Due Date (Desc)" : "NA期限が遅い順"}</option>
              <option value="updated_desc">{lang === "en" ? "Recently Updated" : "更新が新しい順"}</option>
            </select>
          </div>
        </div>

        {/* アーカイブ表示チェックボックス */}
        <div className="flex items-center gap-2 pt-2 border-t border-outline-variant/20 text-xs">
          <input
            type="checkbox"
            id="showArchived"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="rounded text-primary focus:ring-primary h-4 w-4"
          />
          <label htmlFor="showArchived" className="text-on-surface-variant cursor-pointer">
            {t("all_tasks.filter_show_archived")}
          </label>
        </div>
      </div>

      {/* タスク一覧（M3 List） */}
      {filteredTasks.length === 0 ? (
        <div className="rounded-[16px] border border-dashed border-outline-variant p-12 text-center text-sm text-on-surface-variant">
          {t("alerts.empty_section")}
        </div>
      ) : (
        <div className="rounded-[28px] bg-surface-container-lowest border-none shadow-none overflow-hidden">
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
    <Suspense
      fallback={
        <div role="status" aria-busy="true" className="space-y-6">
          <span className="sr-only">タスク一覧を読み込み中...</span>
          <div className="h-8 w-44 rounded-full m3-shimmer" />
          <div className="h-32 rounded-[28px] bg-surface-container-lowest m3-shimmer" />
          <div className="h-64 rounded-[28px] bg-surface-container-lowest m3-shimmer" />
        </div>
      }
    >
      <AllTasksContent />
    </Suspense>
  );
}
