"use client";

import React, { useState, useTransition } from "react";
import { Task, Member, Role } from "@/lib/schemas";
import { isOverdueNA, isDueThisWeekNA } from "@/lib/services";
import { parseFuzzyDate, getTodayJST } from "@/lib/time";
import { Avatar } from "./Avatar";
import {
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  PlayCircle,
  Zap,
  Archive,
  RotateCcw,
  History,
  RefreshCw,
} from "lucide-react";
import { TaskQuickNAUpdateModal, TaskHistoryModal } from "./TaskModals";
import { archiveTaskAction, restoreTaskAction } from "@/app/actions/tasks";
import { useDashboard } from "@/context/DashboardContext";

interface TaskCardProps {
  task: Task;
  members: Member[];
  roles: Role[];
  lang?: "ja" | "en";
}

export function TaskCard({ task, members, roles, lang = "ja" }: TaskCardProps) {
  const { data, refresh } = useDashboard();
  const [isOpen, setIsOpen] = useState(false);
  const [quickModalOpen, setQuickModalOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  const today = getTodayJST();
  const isOverdue = isOverdueNA(task, today);
  const isDueThisWeek = isDueThisWeekNA(task, today);

  const memberMap = new Map(members.map((m) => [m.memberId, m]));
  const roleMap = new Map(roles.map((r) => [r.roleId, r]));

  const owner = memberMap.get(task.ownerMemberId);
  const ownerName = owner
    ? lang === "en" && owner.displayNameEn
      ? owner.displayNameEn
      : owner.displayName
    : task.ownerMemberId || (lang === "en" ? "Unassigned" : "未設定");

  const requestedByMember = memberMap.get(task.requestedBy);
  const requestedByName = requestedByMember
    ? lang === "en" && requestedByMember.displayNameEn
      ? requestedByMember.displayNameEn
      : requestedByMember.displayName
    : task.requestedBy;

  const roleNames = task.roleIds
    .split(",")
    .map((rid) => rid.trim())
    .filter(Boolean)
    .map((rid) => {
      const r = roleMap.get(rid);
      return r ? (lang === "en" && r.nameEn ? r.nameEn : r.name) : rid;
    })
    .join(" / ");

  const { dateString: naDueStr } = parseFuzzyDate(task.naDue);

  const handleToggleArchive = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActionError(null);

    startTransition(async () => {
      const action = task.archived ? restoreTaskAction : archiveTaskAction;
      const res = await action({
        taskId: task.taskId,
        expectedUpdatedAt: task.updatedAt,
      });

      if (res.success) {
        await refresh();
      } else {
        setActionError(res.error || "アーカイブの切り替えに失敗しました。");
      }
    });
  };

  return (
    <>
      <div
        className={`rounded-xl border transition ${
          isOverdue
            ? "border-red-200 bg-red-50/20 hover:border-red-300"
            : task.status === "完了"
            ? "border-slate-200 bg-slate-50/40 opacity-80"
            : task.archived
            ? "border-dashed border-slate-300 bg-slate-50/60 opacity-60"
            : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs"
        }`}
      >
        {/* カードヘッダー */}
        <div
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-start justify-between gap-3 p-4 cursor-pointer select-none"
        >
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              {/* ステータスバッジ */}
              <span
                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${
                  task.status === "完了"
                    ? "bg-emerald-100 text-emerald-800"
                    : task.status === "進行中"
                    ? "bg-blue-100 text-blue-800"
                    : task.status === "確認待ち" || task.status === "待ち"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                {task.status === "完了" && <CheckCircle2 className="h-3 w-3" />}
                {task.status === "進行中" && <PlayCircle className="h-3 w-3" />}
                {(task.status === "確認待ち" || task.status === "待ち") && <Clock className="h-3 w-3" />}
                {task.status}
              </span>

              {/* 依頼状態バッジ（依頼中・相談中） */}
              {task.assignmentStatus === "依頼中" && (
                <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                  依頼中
                </span>
              )}
              {task.assignmentStatus === "相談中" && (
                <span className="rounded-md bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-800">
                  相談中
                </span>
              )}

              {/* 期限切れバッジ */}
              {isOverdue && (
                <span className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2 py-0.5 text-xs font-bold text-white shadow-xs">
                  <AlertCircle className="h-3 w-3" />
                  {lang === "en" ? "Overdue" : "期限切れ"}
                </span>
              )}

              {/* 今週期限バッジ */}
              {!isOverdue && isDueThisWeek && (
                <span className="inline-flex items-center rounded-md bg-amber-500 px-2 py-0.5 text-xs font-semibold text-white">
                  {lang === "en" ? "Due this week" : "今週期限"}
                </span>
              )}

              {/* アーカイブ済バッジ */}
              {task.archived && (
                <span className="rounded-md bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
                  アーカイブ済
                </span>
              )}

              {/* 重さ */}
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600 font-medium">
                {lang === "en" ? `Weight: ${task.weight}` : `重さ: ${task.weight}`}
              </span>

              {/* 役職 */}
              {roleNames && (
                <span className="text-xs text-slate-400 font-medium truncate max-w-[200px]">
                  {roleNames}
                </span>
              )}
            </div>

            {/* タイトル */}
            <h3 className="text-base font-semibold text-slate-900 leading-snug">
              {task.title}
            </h3>

            {/* 次のアクション (NA) */}
            {task.nextAction && (
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <span className="font-semibold text-slate-700">NA:</span>
                <span className="text-slate-800">{task.nextAction}</span>
                {naDueStr && (
                  <span className={`inline-flex items-center gap-1 font-medium ${isOverdue ? "text-red-600" : "text-slate-500"}`}>
                    <Calendar className="h-3 w-3" />
                    {naDueStr}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* 右側: 担当者アバター & 開閉矢印 */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-1.5" title={ownerName}>
              <Avatar name={ownerName} memberId={task.ownerMemberId} size={28} />
              <span className="text-xs font-medium text-slate-700 hidden sm:inline-block max-w-[90px] truncate">
                {ownerName}
              </span>
            </div>
            <button className="text-slate-400 hover:text-slate-600">
              {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* 詳細展開部 */}
        {isOpen && (
          <div className="border-t border-slate-100 bg-slate-50/50 p-4 text-xs text-slate-600 space-y-3">
            {actionError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                {actionError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <span className="font-semibold text-slate-500">{lang === "en" ? "Task Due:" : "タスク全体期限:"}</span>{" "}
                <span className="text-slate-800">{task.taskDue || "—"}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-500">{lang === "en" ? "Assignment:" : "依頼状況:"}</span>{" "}
                <span className="text-slate-800">{task.assignmentStatus}</span>
                {requestedByName && <span className="text-slate-500"> ({lang === "en" ? "by" : "依頼元:"} {requestedByName})</span>}
              </div>
            </div>

            {task.assignmentComment && (
              <div>
                <span className="font-semibold text-slate-500">{lang === "en" ? "Comment:" : "依頼コメント:"}</span>{" "}
                <span className="text-slate-800">{task.assignmentComment}</span>
              </div>
            )}

            {task.notes && (
              <div>
                <span className="font-semibold text-slate-500">{lang === "en" ? "Notes:" : "備考・リンク:"}</span>{" "}
                <p className="mt-0.5 text-slate-800 whitespace-pre-wrap">{task.notes}</p>
              </div>
            )}

            {task.blocker && (
              <div className="rounded bg-red-50 p-2 text-red-700 border border-red-200">
                <span className="font-bold">{lang === "en" ? "Blocker:" : "ブロッカー:"}</span> {task.blocker}
              </div>
            )}

            {/* アクションボタン群（F8 / F9 / F10） */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/60">
              <div className="flex items-center gap-1.5">
                {/* NA を更新（F8 簡易） */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setQuickModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition"
                >
                  <Zap className="h-3 w-3" />
                  <span>NAを更新</span>
                </button>

                {/* 変更履歴（F10） */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setHistoryModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition"
                >
                  <History className="h-3 w-3 text-slate-400" />
                  <span>履歴</span>
                </button>
              </div>

              {/* アーカイブ／復元（F9 / S8） */}
              <button
                onClick={handleToggleArchive}
                disabled={isPending}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium transition ${
                  task.archived
                    ? "bg-slate-200 text-slate-700 hover:bg-slate-300"
                    : "text-slate-400 hover:text-red-600 hover:bg-red-50"
                }`}
              >
                {isPending ? (
                  <RefreshCw className="h-3 w-3 animate-spin" />
                ) : task.archived ? (
                  <RotateCcw className="h-3 w-3" />
                ) : (
                  <Archive className="h-3 w-3" />
                )}
                <span>{task.archived ? "復元する" : "アーカイブ"}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 簡易更新モーダル */}
      <TaskQuickNAUpdateModal
        task={task}
        isOpen={quickModalOpen}
        onClose={() => setQuickModalOpen(false)}
        onSuccess={refresh}
      />

      {/* 履歴モーダル */}
      <TaskHistoryModal
        task={task}
        activityLogs={data.activityLog}
        members={members}
        isOpen={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
      />
    </>
  );
}
