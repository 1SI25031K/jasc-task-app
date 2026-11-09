"use client";

import React, { useState, useTransition } from "react";
import { Task, Member, Role } from "@/lib/schemas";
import { isOverdueNA, isDueThisWeekNA } from "@/lib/services";
import { parseFuzzyDate, getTodayJST } from "@/lib/time";
import { Avatar } from "./Avatar";
import { MaterialIcon } from "./MaterialIcon";
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
        className={`border-b border-[#C4C7C5]/40 transition bg-white hover:bg-[#F3EDF7]/30 ${
          task.archived ? "opacity-60" : ""
        }`}
      >
        {/* リスト行ヘッダー（クリックで詳細展開） */}
        <div
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-start justify-between gap-3 py-3 px-2 sm:px-3 cursor-pointer select-none"
        >
          <div className="flex-1 min-w-0">
            {/* バッジ・メタ情報行 */}
            <div className="flex flex-wrap items-center gap-2 mb-1">
              {/* ステータス */}
              <span
                className={`inline-flex items-center gap-1 rounded-[8px] px-2 py-0.5 text-xs font-medium ${
                  task.status === "完了"
                    ? "bg-[#C4EED0] text-[#072711]"
                    : task.status === "進行中"
                    ? "bg-[#D3E3FD] text-[#041E49]"
                    : task.status === "確認待ち" || task.status === "待ち"
                    ? "bg-[#FFDCC1] text-[#8B4A00]"
                    : "bg-[#F3EDF7] text-[#444746]"
                }`}
              >
                {task.status === "完了" && <MaterialIcon name="check_circle" className="text-xs" />}
                {task.status === "進行中" && <MaterialIcon name="play_arrow" className="text-xs" />}
                {(task.status === "確認待ち" || task.status === "待ち") && <MaterialIcon name="schedule" className="text-xs" />}
                {task.status}
              </span>

              {/* 依頼状態バッジ（依頼中・相談中） */}
              {task.assignmentStatus === "依頼中" && (
                <span className="rounded-[8px] bg-[#D3E3FD] px-2 py-0.5 text-xs font-medium text-[#041E49]">
                  依頼中
                </span>
              )}
              {task.assignmentStatus === "相談中" && (
                <span className="rounded-[8px] bg-[#E9DDFF] px-2 py-0.5 text-xs font-medium text-[#6B4FBB]">
                  相談中
                </span>
              )}

              {/* 期限切れバッジ（赤はエラー・アラート限定） */}
              {isOverdue && (
                <span className="inline-flex items-center gap-1 rounded-[8px] bg-[#B3261E] px-2 py-0.5 text-xs font-medium text-white shadow-xs">
                  <MaterialIcon name="warning" className="text-xs" />
                  {lang === "en" ? "Overdue" : "期限切れ"}
                </span>
              )}

              {/* 今週期限バッジ */}
              {!isOverdue && isDueThisWeek && (
                <span className="inline-flex items-center rounded-[8px] bg-[#FFDCC1] px-2 py-0.5 text-xs font-medium text-[#8B4A00]">
                  {lang === "en" ? "Due this week" : "今週期限"}
                </span>
              )}

              {/* アーカイブ済バッジ */}
              {task.archived && (
                <span className="rounded-[8px] bg-[#F3EDF7] px-2 py-0.5 text-xs font-normal text-[#444746]">
                  アーカイブ済
                </span>
              )}

              {/* 重さ */}
              <span className="text-[11px] text-[#747775]">
                {lang === "en" ? `Weight: ${task.weight}` : `重さ: ${task.weight}`}
              </span>

              {/* 役職 */}
              {roleNames && (
                <span className="text-xs text-[#747775] truncate max-w-[200px]">
                  {roleNames}
                </span>
              )}
            </div>

            {/* タイトル */}
            <h3 className="text-sm sm:text-base font-normal text-[#1F1F1F] leading-snug">
              {task.title}
            </h3>

            {/* 次のアクション (NA) */}
            {task.nextAction && (
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#444746]">
                <span className="font-medium text-[#1F1F1F]">NA:</span>
                <span className="text-[#1F1F1F]">{task.nextAction}</span>
                {naDueStr && (
                  <span className={`inline-flex items-center gap-1 font-medium ${isOverdue ? "text-[#B3261E]" : "text-[#747775]"}`}>
                    <MaterialIcon name="calendar_today" className="text-xs" />
                    {naDueStr}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* 右側: 担当者アバター & 開閉矢印 */}
          <div className="flex items-center gap-2 shrink-0 pt-1">
            <div className="flex items-center gap-1.5" title={ownerName}>
              <Avatar name={ownerName} memberId={task.ownerMemberId} size={28} />
              <span className="text-xs text-[#1F1F1F] hidden sm:inline-block max-w-[90px] truncate">
                {ownerName}
              </span>
            </div>
            <button
              aria-label={isOpen ? "詳細を閉じる" : "詳細を開く"}
              className="text-[#747775] hover:text-[#1F1F1F] p-1"
            >
              <MaterialIcon name={isOpen ? "expand_less" : "expand_more"} className="text-xl" />
            </button>
          </div>
        </div>

        {/* 詳細展開部 */}
        {isOpen && (
          <div className="border-t border-[#C4C7C5]/30 bg-[#F8F9FA] p-4 text-xs text-[#444746] space-y-3">
            {actionError && (
              <div className="rounded-[8px] border border-[#B3261E]/40 bg-[#F9DEDC] p-2 text-xs text-[#410E0B]">
                {actionError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <span className="font-medium text-[#747775]">{lang === "en" ? "Task Due:" : "タスク全体期限:"}</span>{" "}
                <span className="text-[#1F1F1F]">{task.taskDue || "—"}</span>
              </div>
              <div>
                <span className="font-medium text-[#747775]">{lang === "en" ? "Assignment:" : "依頼状況:"}</span>{" "}
                <span className="text-[#1F1F1F]">{task.assignmentStatus}</span>
                {requestedByName && <span className="text-[#747775]"> ({lang === "en" ? "by" : "依頼元:"} {requestedByName})</span>}
              </div>
            </div>

            {task.assignmentComment && (
              <div>
                <span className="font-medium text-[#747775]">{lang === "en" ? "Comment:" : "依頼コメント:"}</span>{" "}
                <span className="text-[#1F1F1F]">{task.assignmentComment}</span>
              </div>
            )}

            {task.notes && (
              <div>
                <span className="font-medium text-[#747775]">{lang === "en" ? "Notes:" : "備考・リンク:"}</span>{" "}
                <p className="mt-0.5 text-[#1F1F1F] whitespace-pre-wrap">{task.notes}</p>
              </div>
            )}

            {task.blocker && (
              <div className="rounded-[8px] bg-[#F9DEDC] p-2 text-[#410E0B] border border-[#B3261E]/30">
                <span className="font-medium">{lang === "en" ? "Blocker:" : "ブロッカー:"}</span> {task.blocker}
              </div>
            )}

            {/* アクションボタン群（M3 スタイル） */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#C4C7C5]/30">
              <div className="flex items-center gap-2">
                {/* NA を更新（F8 簡易） */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setQuickModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-[#D3E3FD] text-xs font-medium text-[#041E49] hover:bg-[#D3E3FD]/80 active:bg-[#041E49] active:text-white transition"
                >
                  <MaterialIcon name="bolt" className="text-sm" />
                  <span>NAを更新</span>
                </button>

                {/* 変更履歴（F10） */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setHistoryModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-white text-xs font-medium text-[#444746] border border-[#747775] hover:bg-[#F3EDF7] transition"
                >
                  <MaterialIcon name="history" className="text-sm text-[#747775]" />
                  <span>履歴</span>
                </button>
              </div>

              {/* アーカイブ／復元（F9 / S8） */}
              <button
                onClick={handleToggleArchive}
                disabled={isPending}
                className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium transition ${
                  task.archived
                    ? "bg-[#F3EDF7] text-[#1F1F1F] hover:bg-[#ECE6F0]"
                    : "text-[#747775] hover:text-[#B3261E] hover:bg-[#F9DEDC]/50"
                }`}
              >
                {isPending ? (
                  <MaterialIcon name="refresh" className="text-sm animate-spin" />
                ) : (
                  <MaterialIcon name={task.archived ? "unarchive" : "archive"} className="text-sm" />
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
