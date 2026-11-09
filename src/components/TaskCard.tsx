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
import { useSnackbar } from "@/context/SnackbarContext";

interface TaskCardProps {
  task: Task;
  members: Member[];
  roles: Role[];
  lang?: "ja" | "en";
  showOwner?: boolean; // マイタスク画面等でアバター・名前を非表示にする設定（作業1-6）
}

export function TaskCard({
  task,
  members,
  roles,
  lang = "ja",
  showOwner = true,
}: TaskCardProps) {
  const { data, refresh } = useDashboard();
  const { showSnackbar } = useSnackbar();
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
        if (!task.archived) {
          showSnackbar({
            message: "タスクをアーカイブしました",
            action: {
              label: "元に戻す",
              onClick: async () => {
                await restoreTaskAction({
                  taskId: task.taskId,
                  expectedUpdatedAt: res.data?.updatedAt || task.updatedAt,
                });
                await refresh();
              },
            },
          });
        } else {
          showSnackbar({
            message: "タスクを元に戻しました",
          });
        }
        await refresh();
      } else {
        setActionError(res.error || "アーカイブの切り替えに失敗しました。");
      }
    });
  };

  return (
    <>
      <div
        className={`border-b border-outline-variant/30 transition-colors duration-150 bg-surface-container-lowest hover:bg-surface-container-low/70 ${
          task.archived ? "opacity-60" : ""
        }`}
      >
        {/* リスト行ヘッダー（クリックで詳細展開） */}
        <div
          onClick={() => setIsOpen(!isOpen)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setIsOpen(!isOpen);
            }
          }}
          aria-expanded={isOpen}
          aria-controls={`task-detail-${task.taskId}`}
          className="flex items-start justify-between gap-3 py-3.5 px-3 sm:px-4 cursor-pointer select-none m3-interactive"
        >
          <div className="flex-1 min-w-0">
            {/* バッジ・メタ情報行 */}
            <div className="flex flex-wrap items-center gap-2 mb-1">
              {/* ステータスバッジ（作業1-5: ニュートラル基調で控えめなトーン） */}
              <span
                className={`inline-flex items-center gap-1 rounded-[8px] px-2 py-0.5 text-xs font-medium ${
                  task.status === "完了"
                    ? "bg-surface-container-high text-on-surface-variant"
                    : task.status === "進行中"
                    ? "bg-primary-container text-on-primary-container"
                    : task.status === "確認待ち" || task.status === "待ち"
                    ? "bg-surface-container text-on-surface-variant"
                    : "bg-surface-container-low text-on-surface-variant"
                }`}
              >
                {task.status === "完了" && <MaterialIcon name="check_circle" size={14} className="text-tertiary" />}
                {task.status === "進行中" && <MaterialIcon name="play_arrow" size={14} className="text-primary" />}
                {(task.status === "確認待ち" || task.status === "待ち") && <MaterialIcon name="schedule" size={14} className="text-on-surface-variant" />}
                {task.status}
              </span>

              {/* 依頼状態バッジ（依頼中・相談中） */}
              {task.assignmentStatus === "依頼中" && (
                <span className="rounded-[8px] bg-secondary-container px-2 py-0.5 text-xs font-medium text-on-secondary-container">
                  依頼中
                </span>
              )}
              {task.assignmentStatus === "相談中" && (
                <span className="rounded-[8px] bg-secondary-container px-2 py-0.5 text-xs font-medium text-on-secondary-container">
                  相談中
                </span>
              )}

              {/* 期限切れバッジ（作業1-5: 塗りつぶしの赤ではなく error-container 淡い背景 + on-error-container） */}
              {isOverdue && (
                <span className="inline-flex items-center gap-1 rounded-[8px] bg-error-container text-on-error-container px-2 py-0.5 text-xs font-medium">
                  <MaterialIcon name="warning" size={14} className="text-error" />
                  {lang === "en" ? "Overdue" : "期限切れ"}
                </span>
              )}

              {/* 今週期限バッジ（控えめな表面色） */}
              {!isOverdue && isDueThisWeek && (
                <span className="inline-flex items-center rounded-[8px] bg-surface-container text-on-surface-variant px-2 py-0.5 text-xs font-medium">
                  {lang === "en" ? "Due this week" : "今週期限"}
                </span>
              )}

              {/* アーカイブ済バッジ */}
              {task.archived && (
                <span className="rounded-[8px] bg-surface-container-highest px-2 py-0.5 text-xs font-normal text-on-surface-variant">
                  アーカイブ済
                </span>
              )}

              {/* 重さ */}
              <span className="text-[11px] text-on-surface-variant">
                {lang === "en" ? `Weight: ${task.weight}` : `重さ: ${task.weight}`}
              </span>

              {/* 役職 */}
              {roleNames && (
                <span className="text-xs text-on-surface-variant truncate max-w-[200px]">
                  {roleNames}
                </span>
              )}
            </div>

            {/* タイトル */}
            <h3 className="text-sm sm:text-base font-normal text-on-surface leading-snug">
              {task.title}
            </h3>

            {/* 次のアクション (NA) */}
            {task.nextAction && (
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-on-surface-variant">
                <span className="font-medium text-on-surface">NA:</span>
                <span className="text-on-surface">{task.nextAction}</span>
                {naDueStr && (
                  <span className={`inline-flex items-center gap-1 font-medium ${isOverdue ? "text-error" : "text-on-surface-variant"}`}>
                    <MaterialIcon name="calendar_today" size={13} />
                    {naDueStr}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* 右側: 担当者アバター & 開閉矢印（作業1-6: showOwner が false のときはアバター非表示） */}
          <div className="flex items-center gap-2 shrink-0 pt-1">
            {showOwner && (
              <div className="flex items-center gap-1.5" title={ownerName}>
                <Avatar name={ownerName} memberId={task.ownerMemberId} size={28} />
                <span className="text-xs text-on-surface hidden sm:inline-block max-w-[90px] truncate">
                  {ownerName}
                </span>
              </div>
            )}
            <button
              aria-label={isOpen ? "詳細を閉じる" : "詳細を開く"}
              className="text-on-surface-variant hover:text-on-surface p-1 transition-transform duration-200"
            >
              <MaterialIcon
                name="expand_more"
                size={20}
                className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
              />
            </button>
          </div>
        </div>

        {/* 詳細展開部（grid-template-rows 0fr -> 1fr による滑らかな開閉アニメーション） */}
        <div
          id={`task-detail-${task.taskId}`}
          role="region"
          aria-label={`${task.title} の詳細情報`}
          className={`grid transition-[grid-template-rows,opacity] duration-medium2 ease-emphasized-decelerate ${
            isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 pointer-events-none"
          }`}
        >
          <div className="overflow-hidden">
            <div className="border-t border-outline-variant/20 bg-surface-container-low/50 p-4 text-xs text-on-surface-variant space-y-3">
              {actionError && (
                <div className="rounded-[8px] border border-error/40 bg-error-container p-2 text-xs text-on-error-container">
                  {actionError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <span className="font-medium text-on-surface-variant">{lang === "en" ? "Task Due:" : "タスク全体期限:"}</span>{" "}
                  <span className="text-on-surface">{task.taskDue || "—"}</span>
                </div>
                <div>
                  <span className="font-medium text-on-surface-variant">{lang === "en" ? "Assignment:" : "依頼状況:"}</span>{" "}
                  <span className="text-on-surface">{task.assignmentStatus}</span>
                  {requestedByName && <span className="text-on-surface-variant"> ({lang === "en" ? "by" : "依頼元:"} {requestedByName})</span>}
                </div>
              </div>

              {task.assignmentComment && (
                <div>
                  <span className="font-medium text-on-surface-variant">{lang === "en" ? "Comment:" : "依頼コメント:"}</span>{" "}
                  <span className="text-on-surface">{task.assignmentComment}</span>
                </div>
              )}

              {task.notes && (
                <div>
                  <span className="font-medium text-on-surface-variant">{lang === "en" ? "Notes:" : "備考・リンク:"}</span>{" "}
                  <p className="mt-0.5 text-on-surface whitespace-pre-wrap">{task.notes}</p>
                </div>
              )}

              {task.blocker && (
                <div className="rounded-[8px] bg-error-container p-2 text-on-error-container border border-error/30">
                  <span className="font-medium">{lang === "en" ? "Blocker:" : "ブロッカー:"}</span> {task.blocker}
                </div>
              )}

              {/* アクションボタン群（M3 スタイル） */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-outline-variant/30">
                <div className="flex items-center gap-2">
                  {/* NA を更新（F8 簡易） */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setQuickModalOpen(true);
                    }}
                    className="m3-interactive inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-primary-container text-xs font-medium text-on-primary-container transition"
                  >
                    <MaterialIcon name="bolt" size={16} />
                    <span>NAを更新</span>
                  </button>

                  {/* 変更履歴（F10） */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setHistoryModalOpen(true);
                    }}
                    className="m3-interactive inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-surface-container-lowest text-xs font-medium text-on-surface-variant border border-outline transition"
                  >
                    <MaterialIcon name="history" size={16} className="text-on-surface-variant" />
                    <span>履歴</span>
                  </button>
                </div>

                {/* アーカイブ／復元（F9 / S8） */}
                <button
                  onClick={handleToggleArchive}
                  disabled={isPending}
                  className={`m3-interactive inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium transition ${
                    task.archived
                      ? "bg-surface-container text-on-surface hover:bg-surface-container-high"
                      : "text-on-surface-variant hover:text-error hover:bg-error-container/40"
                  }`}
                >
                  {isPending ? (
                    <MaterialIcon name="refresh" size={16} className="animate-spin" />
                  ) : (
                    <MaterialIcon name={task.archived ? "unarchive" : "archive"} size={16} />
                  )}
                  <span>{task.archived ? "復元する" : "アーカイブ"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
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
