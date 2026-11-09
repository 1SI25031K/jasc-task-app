"use client";

import React, { useState, useTransition } from "react";
import { Task, Member, Role, ActivityLog } from "@/lib/schemas";
import { calcMemberAutoLoad, getLatestCheckin } from "@/lib/services";
import { getTodayJST } from "@/lib/time";
import {
  createTaskAction,
  updateTaskAction,
  quickUpdateNAAction,
  archiveTaskAction,
  restoreTaskAction,
  CreateTaskInput,
  UpdateTaskInput,
} from "@/app/actions/tasks";
import {
  X,
  Plus,
  Edit2,
  Zap,
  Archive,
  RotateCcw,
  History,
  AlertCircle,
  RefreshCw,
  Check,
} from "lucide-react";

// ==========================================
// 1. タスク新規作成モーダル（F7）
// ==========================================
export function TaskCreateModal({
  isOpen,
  onClose,
  members,
  roles,
  tasks,
  checkins,
  currentMemberId,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  members: Member[];
  roles: Role[];
  tasks: Task[];
  checkins: any[];
  currentMemberId: string;
  onSuccess: () => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const today = getTodayJST();

  const [title, setTitle] = useState("");
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [ownerMemberId, setOwnerMemberId] = useState(currentMemberId || members[0]?.memberId || "");
  const [weight, setWeight] = useState("中");
  const [nextAction, setNextAction] = useState("");
  const [naDue, setNaDue] = useState(today);
  const [taskDue, setTaskDue] = useState("");
  const [status, setStatus] = useState("未着手");
  const [priority, setPriority] = useState("中");
  const [waitingOnMemberId, setWaitingOnMemberId] = useState("");
  const [blocker, setBlocker] = useState("");
  const [notes, setNotes] = useState("");

  if (!isOpen) return null;

  const toggleRole = (roleId: string) => {
    setSelectedRoleIds((prev) =>
      prev.includes(roleId) ? prev.filter((r) => r !== roleId) : [...prev, roleId]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!title.trim()) {
      setErrorMessage("タスク名を入力してください。");
      return;
    }
    if (selectedRoleIds.length === 0) {
      setErrorMessage("少なくとも1つの役職を選択してください。");
      return;
    }
    if (!ownerMemberId) {
      setErrorMessage("担当者を選択してください。");
      return;
    }
    if (!nextAction.trim()) {
      setErrorMessage("次のアクション（NA）を入力してください。");
      return;
    }
    if (!naDue) {
      setErrorMessage("NA期限を入力してください。");
      return;
    }

    const input: CreateTaskInput = {
      title: title.trim(),
      roleIds: selectedRoleIds.join(","),
      ownerMemberId,
      weight,
      nextAction: nextAction.trim(),
      naDue,
      taskDue,
      status,
      waitingOnMemberId: status === "待ち" ? waitingOnMemberId : "",
      priority,
      blocker: blocker.trim(),
      notes: notes.trim(),
    };

    startTransition(async () => {
      const res = await createTaskAction(input);
      if (res.success) {
        await onSuccess();
        onClose();
      } else {
        setErrorMessage(res.error || "タスク作成に失敗しました。");
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs overflow-y-auto">
      <div className="my-8 w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-lg font-bold text-slate-800">新規タスクの作成（F7）</h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {errorMessage && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* タスク名 */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              タスク名 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例：春合宿の宿泊先予約"
              maxLength={100}
              className="w-full rounded-xl border border-slate-300 p-2.5 text-sm focus:border-blue-500 focus:outline-none"
              required
            />
          </div>

          {/* 役職（複数選択） */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              関連する役職（複数可） <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1.5 border border-slate-200 rounded-xl bg-slate-50">
              {roles.map((r) => {
                const isSelected = selectedRoleIds.includes(r.roleId);
                return (
                  <button
                    key={r.roleId}
                    type="button"
                    onClick={() => toggleRole(r.roleId)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                      isSelected
                        ? "bg-blue-600 text-white shadow-xs"
                        : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {isSelected && <Check className="inline-block h-3 w-3 mr-1" />}
                    {r.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 担当者（自動負荷・体感負荷を表示 F7） */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              担当者 <span className="text-red-500">*</span>
              {ownerMemberId !== currentMemberId && (
                <span className="ml-2 text-[11px] font-normal text-blue-600">
                  ※自分以外を指定すると「依頼中」になります（5.3）
                </span>
              )}
            </label>
            <select
              value={ownerMemberId}
              onChange={(e) => setOwnerMemberId(e.target.value)}
              className="w-full rounded-xl border border-slate-300 p-2.5 text-sm focus:border-blue-500 focus:outline-none"
            >
              {members.map((m) => {
                const autoLoad = calcMemberAutoLoad(m.memberId, tasks, today);
                const { checkin } = getLatestCheckin(m.memberId, checkins, today);
                const checkinStr = checkin ? `${checkin.score}` : "-";
                return (
                  <option key={m.memberId} value={m.memberId}>
                    {m.displayName}（自動 {autoLoad}pt ／ 体感 {checkinStr}）
                  </option>
                );
              })}
            </select>
          </div>

          {/* 重さ & 優先度 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                重さ（軽=1pt, 中=2pt, 重=3pt）
              </label>
              <select
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="軽">軽（1〜2時間程度）</option>
                <option value="中">中（半日〜1日程度）</option>
                <option value="重">重（数日以上・要調整）</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">優先度</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="高">高</option>
                <option value="中">中</option>
                <option value="低">低</option>
              </select>
            </div>
          </div>

          {/* 次のアクション（NA） */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              次のアクション（NA） <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
              placeholder="すぐ動ける粒度の1ステップ（例：宿泊先に候補日程の空き状況をメールで照会）"
              maxLength={200}
              className="w-full rounded-xl border border-slate-300 p-2.5 text-sm focus:border-blue-500 focus:outline-none"
              required
            />
          </div>

          {/* NA期限 & 全体期限 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                NA期限 <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={naDue}
                onChange={(e) => setNaDue(e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-2 text-sm focus:border-blue-500 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                タスク全体の期限（任意）
              </label>
              <input
                type="date"
                value={taskDue}
                onChange={(e) => setTaskDue(e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* ステータス */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">ステータス</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-xl border border-slate-300 p-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="未着手">未着手</option>
              <option value="進行中">進行中</option>
              <option value="待ち">待ち（相手の返事等）</option>
              <option value="完了">完了</option>
            </select>
          </div>

          {status === "待ち" && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">待っている相手（メンバー）</label>
              <select
                value={waitingOnMemberId}
                onChange={(e) => setWaitingOnMemberId(e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="">未指定（外部等）</option>
                {members.map((m) => (
                  <option key={m.memberId} value={m.memberId}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* メモ（個人情報禁止 S9） */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              メモ <span className="text-[11px] font-normal text-slate-400">（※個人情報は入力しないでください S9）</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="連絡事項や補足メモ"
              className="w-full rounded-xl border border-slate-300 p-2.5 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* ボタン */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="rounded-full px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 transition"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {isPending && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              <span>タスクを作成する</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// 2. 「NA を更新」簡易モーダル（F8 簡易）
// ==========================================
export function TaskQuickNAUpdateModal({
  task,
  isOpen,
  onClose,
  onSuccess,
}: {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [nextAction, setNextAction] = useState(task?.nextAction || "");
  const [naDue, setNaDue] = useState(task?.naDue || "");
  const [status, setStatus] = useState(task?.status || "進行中");

  if (!isOpen || !task) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    startTransition(async () => {
      const res = await quickUpdateNAAction({
        taskId: task.taskId,
        nextAction: nextAction.trim(),
        naDue,
        status,
        expectedUpdatedAt: task.updatedAt,
      });

      if (res.success) {
        await onSuccess();
        onClose();
      } else {
        setErrorMessage(res.error || "NAの更新に失敗しました。");
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-1.5">
            <Zap className="h-4 w-4 text-blue-600" />
            <h3 className="font-bold text-slate-800">NA を素早く更新（F8）</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-2 text-xs font-medium text-slate-500 line-clamp-1">{task.title}</p>

        {errorMessage && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              次のアクション（NA） <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
              className="w-full rounded-xl border border-slate-300 p-2.5 text-sm focus:border-blue-500 focus:outline-none"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                NA期限 <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={naDue}
                onChange={(e) => setNaDue(e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-2 text-sm focus:border-blue-500 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">ステータス</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="未着手">未着手</option>
                <option value="進行中">進行中</option>
                <option value="待ち">待ち</option>
                <option value="完了">完了</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="rounded-full px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 transition"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {isPending && <RefreshCw className="h-3 w-3 animate-spin" />}
              <span>保存する</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// 3. 変更履歴モーダル（F10）
// ==========================================
export function TaskHistoryModal({
  task,
  activityLogs,
  members,
  isOpen,
  onClose,
}: {
  task: Task | null;
  activityLogs: ActivityLog[];
  members: Member[];
  isOpen: boolean;
  onClose: () => void;
}) {
  if (!isOpen || !task) return null;

  const memberMap = new Map(members.map((m) => [m.memberId, m.displayName]));
  const logs = activityLogs
    .filter((l) => l.taskId === task.taskId)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-1.5">
            <History className="h-4 w-4 text-blue-600" />
            <h3 className="font-bold text-slate-800">変更履歴（F10）</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-2 text-xs font-semibold text-slate-700 line-clamp-1">{task.title}</p>

        <div className="mt-4 max-h-80 overflow-y-auto space-y-2.5 pr-1">
          {logs.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-400">変更履歴はありません。</p>
          ) : (
            logs.map((log, idx) => {
              const actor = memberMap.get(log.memberId) || log.memberId;
              return (
                <div key={idx} className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 text-xs">
                  <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1">
                    <span>{log.timestamp ? new Date(log.timestamp).toLocaleString("ja-JP") : "-"}</span>
                    <span className="font-semibold text-slate-700">{actor}</span>
                  </div>
                  <div className="font-medium text-slate-800">
                    操作: <span className="rounded bg-white px-1.5 py-0.5 border border-slate-200">{log.action}</span>
                  </div>
                  {(log.oldValue || log.newValue) && (
                    <div className="mt-1 text-slate-600 text-[11px] space-y-0.5">
                      {log.oldValue && <div>変更前: {log.oldValue}</div>}
                      {log.newValue && <div>変更後: {log.newValue}</div>}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="flex justify-end pt-3 border-t border-slate-100 mt-4">
          <button
            onClick={onClose}
            className="rounded-full bg-slate-100 px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 transition"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
