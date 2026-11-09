"use client";

import React, { useState, useTransition } from "react";
import { useDashboard } from "@/context/DashboardContext";
import { TaskCard } from "@/components/TaskCard";
import { parseFuzzyDate } from "@/lib/time";
import { Inbox, Send, ListFilter, CheckCircle2, MessageSquare, AlertCircle, RefreshCw } from "lucide-react";
import { acceptTaskAction, consultTaskAction } from "@/app/actions/tasks";
import { Task } from "@/lib/schemas";

export default function InboxPage() {
  const { data, currentMember, lang, t, refresh } = useDashboard();
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
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* ページタイトル */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-800">{t("inbox.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("inbox.subtitle")}</p>
      </div>

      {/* エラー・楽観的ロック警告バナー */}
      {errorMessage && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex items-start justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">{conflictOccurred ? "他の更新と競合しました（S7）" : "エラーが発生しました"}</p>
              <p className="mt-0.5 text-xs text-red-700">{errorMessage}</p>
            </div>
          </div>
          {conflictOccurred && (
            <button
              onClick={refresh}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-red-700 transition"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              最新に再読み込み
            </button>
          )}
        </div>
      )}

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
        <div className="space-y-4">
          {currentTasks.map((task) => {
            const isTargetToMe =
              activeTab === "to_me" &&
              task.ownerMemberId === currentMember.memberId &&
              task.assignmentStatus === "依頼中";
            const reqMember = memberMap.get(task.requestedBy);
            const reqName = reqMember ? reqMember.displayName : task.requestedBy;
            const isProcessingThis = isPending && activeTaskId === task.taskId;

            return (
              <div key={task.taskId} className="space-y-2">
                <TaskCard
                  task={task}
                  members={data.members}
                  roles={data.roles}
                  lang={lang}
                />

                {/* 自分宛ての「依頼中」タスクに対する承諾・相談アクションバー */}
                {isTargetToMe && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-xs">
                    <div className="text-blue-900 font-medium">
                      <strong>{reqName}</strong> さんからあなたへのタスク依頼です。内容を確認して返答してください。
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleAccept(task)}
                        disabled={isPending}
                        className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 font-semibold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50 transition"
                      >
                        {isProcessingThis ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5" />
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
                        className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3.5 py-2 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition"
                      >
                        <MessageSquare className="h-3.5 w-3.5 text-slate-500" />
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

      {/* 相談モーダル */}
      {consultModalTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-800">
              タスクの依頼について相談する
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              依頼元の <strong>{memberMap.get(consultModalTask.requestedBy)?.displayName || consultModalTask.requestedBy}</strong> さんに送る相談理由や調整希望を入力してください（必須）。
            </p>

            <form onSubmit={handleConsultSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  相談コメント <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={consultComment}
                  onChange={(e) => setConsultComment(e.target.value)}
                  rows={4}
                  placeholder="例：テスト期間のため、着手を1週間遅らせていただくことは可能でしょうか？"
                  className="w-full rounded-xl border border-slate-300 p-3 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  maxLength={200}
                  required
                />
                <div className="mt-1 text-right text-[11px] text-slate-400">
                  {consultComment.length} / 200 文字
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setConsultModalTask(null)}
                  disabled={isPending}
                  className="rounded-full px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 transition"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={isPending || !consultComment.trim()}
                  className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50 transition"
                >
                  {isPending && <RefreshCw className="h-3 w-3 animate-spin" />}
                  <span>相談を送信</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
