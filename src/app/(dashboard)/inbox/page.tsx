"use client";

import React, { useState, useTransition } from "react";
import { useDashboard } from "@/context/DashboardContext";
import { useSnackbar } from "@/context/SnackbarContext";
import { TaskCard } from "@/components/TaskCard";
import { parseFuzzyDate } from "@/lib/time";
import { MaterialIcon } from "@/components/MaterialIcon";
import { M3Dialog } from "@/components/M3Dialog";
import { acceptTaskAction, consultTaskAction } from "@/app/actions/tasks";
import { Task } from "@/lib/schemas";

export default function InboxPage() {
  const { data, currentMember, lang, t, refresh } = useDashboard();
  const { showSnackbar } = useSnackbar();
  const [activeTab, setActiveTab] = useState<"to_me" | "from_me" | "all">("to_me");

  // アクション実行状態
  const [isPending, startTransition] = useTransition();
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [consultModalTask, setConsultModalTask] = useState<Task | null>(null);
  const [consultComment, setConsultComment] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [conflictOccurred, setConflictOccurred] = useState(false);

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
      icon: "inbox",
    },
    {
      id: "from_me",
      label: lang === "en" ? `Sent by Me (${fromMeRequests.length})` : `自分が依頼中 (${fromMeRequests.length})`,
      count: fromMeRequests.length,
      icon: "send",
    },
    {
      id: "all",
      label: lang === "en" ? `All Pending (${allRequests.length})` : `全体の依頼・相談 (${allRequests.length})`,
      count: allRequests.length,
      icon: "list",
    },
  ] as const;

  const currentTasks =
    activeTab === "to_me"
      ? toMeRequests
      : activeTab === "from_me"
      ? fromMeRequests
      : allRequests;

  // 承諾ハンドラ
  const handleAccept = (task: Task) => {
    setActiveTaskId(task.taskId);
    setErrorMessage(null);
    setConflictOccurred(false);

    startTransition(async () => {
      const res = await acceptTaskAction({
        taskId: task.taskId,
        expectedUpdatedAt: task.updatedAt,
      });

      setActiveTaskId(null);
      if (res.success) {
        showSnackbar({ message: "依頼を承諾しました" });
        await refresh();
      } else {
        setErrorMessage(res.error || "承諾の処理に失敗しました。");
        if (res.isConflict) {
          setConflictOccurred(true);
        }
      }
    });
  };

  // 相談ハンドラ
  const handleConsultSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!consultModalTask) return;
    if (!consultComment.trim()) {
      setErrorMessage("相談コメントを入力してください。");
      return;
    }

    const task = consultModalTask;
    setActiveTaskId(task.taskId);
    setErrorMessage(null);
    setConflictOccurred(false);

    startTransition(async () => {
      const res = await consultTaskAction({
        taskId: task.taskId,
        comment: consultComment.trim(),
        expectedUpdatedAt: task.updatedAt,
      });

      setActiveTaskId(null);
      if (res.success) {
        showSnackbar({ message: "相談コメントを送信しました" });
        setConsultModalTask(null);
        setConsultComment("");
        await refresh();
      } else {
        setErrorMessage(res.error || "相談の送信に失敗しました。");
        if (res.isConflict) {
          setConflictOccurred(true);
        }
      }
    });
  };

  const memberMap = new Map(data.members.map((m) => [m.memberId, m]));

  return (
    <div className="space-y-6">
      {/* ページタイトル */}
      <div>
        <h1 className="text-2xl font-normal tracking-tight text-on-surface">{t("inbox.title")}</h1>
        <p className="mt-1 text-sm text-on-surface-variant">{t("inbox.subtitle")}</p>
      </div>

      {/* エラー・楽観的ロック警告バナー（S7・エラーは消さずに常時表示） */}
      {errorMessage && (
        <div className="rounded-[28px] bg-error-container p-4 text-sm text-on-error-container flex items-start justify-between gap-3 shadow-none">
          <div className="flex items-start gap-2.5">
            <MaterialIcon name="error_outline" className="text-xl text-error shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">{conflictOccurred ? "他の更新と競合しました（S7）" : "エラーが発生しました"}</p>
              <p className="mt-0.5 text-xs text-on-error-container">{errorMessage}</p>
            </div>
          </div>
          {conflictOccurred && (
            <button
              onClick={refresh}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-error text-xs font-medium text-on-error hover:bg-error/90 transition m3-interactive"
            >
              <MaterialIcon name="refresh" className="text-sm" />
              最新に再読み込み
            </button>
          )}
        </div>
      )}

      {/* M3 Primary Tabs */}
      <div className="flex border-b border-outline-variant/30 space-x-2 overflow-x-auto no-scrollbar">
        {tabs.map((tab) => {
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 border-b-2 py-3 px-4 text-sm font-medium transition shrink-0 m3-interactive ${
                isSelected
                  ? "border-primary text-primary"
                  : "border-transparent text-on-surface-variant hover:text-on-surface"
              }`}
            >
              <MaterialIcon name={tab.icon} className="text-base" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* タスク一覧（M3 List） */}
      {currentTasks.length === 0 ? (
        <div className="rounded-[16px] border border-dashed border-outline-variant p-12 text-center text-sm text-on-surface-variant">
          {t("inbox.empty_inbox")}
        </div>
      ) : (
        <div className="rounded-[28px] bg-surface-container-lowest overflow-hidden border-none shadow-none divide-y divide-outline-variant/20">
          {currentTasks.map((task) => {
            const isTargetToMe =
              activeTab === "to_me" &&
              task.ownerMemberId === currentMember.memberId &&
              task.assignmentStatus === "依頼中";
            const reqMember = memberMap.get(task.requestedBy);
            const reqName = reqMember ? reqMember.displayName : task.requestedBy;
            const isProcessingThis = isPending && activeTaskId === task.taskId;

            return (
              <div key={task.taskId} className="bg-surface-container-lowest">
                <TaskCard
                  task={task}
                  members={data.members}
                  roles={data.roles}
                  lang={lang}
                />

                {/* 自分宛ての「依頼中」タスクに対する承諾・相談アクションバー */}
                {isTargetToMe && (
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-container px-4 py-3 text-xs border-t border-outline-variant/20">
                    <div className="text-on-surface">
                      <strong>{reqName}</strong> さんからあなたへのタスク依頼です。内容を確認して返答してください。
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleAccept(task)}
                        disabled={isPending}
                        className="inline-flex items-center gap-1.5 h-8 px-4 rounded-full bg-primary text-xs font-medium text-on-primary hover:bg-primary/90 disabled:opacity-50 transition m3-interactive"
                      >
                        {isProcessingThis ? (
                          <MaterialIcon name="refresh" className="text-sm animate-spin" />
                        ) : (
                          <MaterialIcon name="check" className="text-sm" />
                        )}
                        <span>承諾する</span>
                      </button>

                      <button
                        onClick={() => {
                          setConsultModalTask(task);
                          setConsultComment(task.assignmentComment || "");
                          setErrorMessage(null);
                        }}
                        disabled={isPending}
                        className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full border border-outline-variant bg-surface-container-lowest text-xs font-medium text-on-surface-variant hover:bg-surface-container-high disabled:opacity-50 transition m3-interactive"
                      >
                        <MaterialIcon name="chat_bubble_outline" className="text-sm text-on-surface-variant" />
                        <span>相談したい</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* M3 相談ダイアログ */}
      {consultModalTask && (
        <M3Dialog
          isOpen={!!consultModalTask}
          onClose={() => setConsultModalTask(null)}
          title="タスクの依頼について相談する"
          maxWidth="max-w-md"
        >
          <p className="mb-3 text-xs text-on-surface-variant">
            依頼元の <strong>{memberMap.get(consultModalTask.requestedBy)?.displayName || consultModalTask.requestedBy}</strong> さんに送る相談理由や調整希望を入力してください（必須）。
          </p>

          <form onSubmit={handleConsultSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-on-surface-variant mb-1.5">
                相談コメント <span className="text-error">*</span>
              </label>
              <textarea
                value={consultComment}
                onChange={(e) => setConsultComment(e.target.value)}
                rows={4}
                placeholder="例：テスト期間のため、着手を1週間遅らせていただくことは可能でしょうか？"
                className="w-full rounded-[12px] border border-outline-variant bg-surface-container-low p-3 text-sm text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:bg-surface-container-lowest focus:outline-none"
                maxLength={200}
                required
              />
              <div className="mt-1 text-right text-[11px] text-on-surface-variant">
                {consultComment.length} / 200 文字
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant/20">
              <button
                type="button"
                onClick={() => setConsultModalTask(null)}
                disabled={isPending}
                className="h-9 px-4 rounded-full text-xs font-medium text-on-surface-variant hover:bg-surface-container-high transition m3-interactive"
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={isPending || !consultComment.trim()}
                className="inline-flex items-center gap-1.5 h-9 px-5 rounded-full bg-primary text-xs font-medium text-on-primary hover:bg-primary/90 disabled:opacity-50 transition m3-interactive"
              >
                {isPending && <MaterialIcon name="refresh" className="text-sm animate-spin" />}
                <span>相談を送信</span>
              </button>
            </div>
          </form>
        </M3Dialog>
      )}
    </div>
  );
}
