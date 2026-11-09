"use client";

import React, { useState, useTransition } from "react";
import { Task, Member, Role, ActivityLog } from "@/lib/schemas";
import { calcMemberAutoLoad, getLatestCheckin } from "@/lib/services";
import { getTodayJST } from "@/lib/time";
import {
  createTaskAction,
  quickUpdateNAAction,
  CreateTaskInput,
} from "@/app/actions/tasks";
import { MaterialIcon } from "@/components/MaterialIcon";
import { M3Dialog } from "@/components/M3Dialog";
import { useSnackbar } from "@/context/SnackbarContext";

// ==========================================
// 1. タスク新規作成モーダル（F7 / M3 Dialog）
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
  const { showSnackbar } = useSnackbar();
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
        showSnackbar({ message: "新規タスクを作成しました" });
        await onSuccess();
        onClose();
      } else {
        setErrorMessage(res.error || "タスク作成に失敗しました。");
      }
    });
  };

  return (
    <M3Dialog isOpen={isOpen} onClose={onClose} title="新規タスクの作成（F7）">
      {errorMessage && (
        <div className="mb-4 rounded-[12px] bg-error-container p-3 text-xs text-on-error-container flex items-center gap-2">
          <MaterialIcon name="error_outline" className="text-base text-error shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* タスク名 */}
        <div>
          <label className="block text-xs font-medium text-on-surface-variant mb-1.5">
            タスク名 <span className="text-error">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例：春合宿の宿泊先予約"
            maxLength={100}
            className="w-full h-10 rounded-[8px] border border-outline-variant bg-surface-container-low px-3 text-xs sm:text-sm text-on-surface focus:border-primary focus:bg-surface-container-lowest focus:outline-none"
            required
          />
        </div>

        {/* 役職（複数選択 / M3 Filter Chips） */}
        <div>
          <label className="block text-xs font-medium text-on-surface-variant mb-1.5">
            関連する役職（複数可） <span className="text-error">*</span>
          </label>
          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 border border-outline-variant/30 rounded-[12px] bg-surface-container">
            {roles.map((r) => {
              const isSelected = selectedRoleIds.includes(r.roleId);
              return (
                <button
                  key={r.roleId}
                  type="button"
                  onClick={() => toggleRole(r.roleId)}
                  className={`h-8 rounded-[8px] px-3 text-xs font-medium transition flex items-center gap-1 m3-interactive ${
                    isSelected
                      ? "bg-secondary-container text-on-secondary-container"
                      : "bg-surface-container-lowest text-on-surface-variant border border-outline-variant hover:bg-surface-container-high"
                  }`}
                >
                  {isSelected && <MaterialIcon name="check" className="text-sm text-primary" />}
                  {r.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* 担当者（自動負荷・体感負荷を表示 F7） */}
        <div>
          <label className="block text-xs font-medium text-on-surface-variant mb-1.5">
            担当者 <span className="text-error">*</span>
            {ownerMemberId !== currentMemberId && (
              <span className="ml-2 text-[11px] font-normal text-primary">
                ※自分以外を指定すると「依頼中」になります（5.3）
              </span>
            )}
          </label>
          <select
            value={ownerMemberId}
            onChange={(e) => setOwnerMemberId(e.target.value)}
            className="w-full h-10 rounded-[8px] border border-outline-variant bg-surface-container-low px-3 text-xs sm:text-sm text-on-surface focus:border-primary focus:bg-surface-container-lowest focus:outline-none"
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
            <label className="block text-xs font-medium text-on-surface-variant mb-1.5">
              重さ（軽=1pt, 中=2pt, 重=3pt）
            </label>
            <select
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="w-full h-10 rounded-[8px] border border-outline-variant bg-surface-container-low px-3 text-xs sm:text-sm text-on-surface focus:border-primary focus:bg-surface-container-lowest focus:outline-none"
            >
              <option value="軽">軽（1〜2時間程度）</option>
              <option value="中">中（半日〜1日程度）</option>
              <option value="重">重（数日以上・要調整）</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1.5">優先度</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full h-10 rounded-[8px] border border-outline-variant bg-surface-container-low px-3 text-xs sm:text-sm text-on-surface focus:border-primary focus:bg-surface-container-lowest focus:outline-none"
            >
              <option value="高">高</option>
              <option value="中">中</option>
              <option value="低">低</option>
            </select>
          </div>
        </div>

        {/* 次のアクション（NA） */}
        <div>
          <label className="block text-xs font-medium text-on-surface-variant mb-1.5">
            次のアクション（NA） <span className="text-error">*</span>
          </label>
          <input
            type="text"
            value={nextAction}
            onChange={(e) => setNextAction(e.target.value)}
            placeholder="すぐ動ける粒度の1ステップ（例：宿泊先に候補日程の空き状況をメールで照会）"
            maxLength={200}
            className="w-full h-10 rounded-[8px] border border-outline-variant bg-surface-container-low px-3 text-xs sm:text-sm text-on-surface focus:border-primary focus:bg-surface-container-lowest focus:outline-none"
            required
          />
        </div>

        {/* NA期限 & 全体期限 */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1.5">
              NA期限 <span className="text-error">*</span>
            </label>
            <input
              type="date"
              value={naDue}
              onChange={(e) => setNaDue(e.target.value)}
              className="w-full h-10 rounded-[8px] border border-outline-variant bg-surface-container-low px-3 text-xs sm:text-sm text-on-surface focus:border-primary focus:bg-surface-container-lowest focus:outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1.5">
              タスク全体の期限（任意）
            </label>
            <input
              type="date"
              value={taskDue}
              onChange={(e) => setTaskDue(e.target.value)}
              className="w-full h-10 rounded-[8px] border border-outline-variant bg-surface-container-low px-3 text-xs sm:text-sm text-on-surface focus:border-primary focus:bg-surface-container-lowest focus:outline-none"
            />
          </div>
        </div>

        {/* ステータス */}
        <div>
          <label className="block text-xs font-medium text-on-surface-variant mb-1.5">ステータス</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full h-10 rounded-[8px] border border-outline-variant bg-surface-container-low px-3 text-xs sm:text-sm text-on-surface focus:border-primary focus:bg-surface-container-lowest focus:outline-none"
          >
            <option value="未着手">未着手</option>
            <option value="進行中">進行中</option>
            <option value="待ち">待ち（相手の返事等）</option>
            <option value="完了">完了</option>
          </select>
        </div>

        {status === "待ち" && (
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1.5">待っている相手（メンバー）</label>
            <select
              value={waitingOnMemberId}
              onChange={(e) => setWaitingOnMemberId(e.target.value)}
              className="w-full h-10 rounded-[8px] border border-outline-variant bg-surface-container-low px-3 text-xs sm:text-sm text-on-surface focus:border-primary focus:bg-surface-container-lowest focus:outline-none"
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
          <label className="block text-xs font-medium text-on-surface-variant mb-1.5">
            メモ <span className="text-[11px] font-normal text-on-surface-variant/80">（※個人情報は入力しないでください S9）</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="連絡事項や補足メモ"
            className="w-full rounded-[12px] border border-outline-variant bg-surface-container-low p-3 text-xs sm:text-sm text-on-surface focus:border-primary focus:bg-surface-container-lowest focus:outline-none"
          />
        </div>

        {/* ボタン */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-outline-variant/20">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="h-10 px-4 rounded-full text-xs font-medium text-on-surface-variant hover:bg-surface-container-high transition m3-interactive"
          >
            キャンセル
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-1.5 h-10 px-5 rounded-full bg-primary text-xs font-medium text-on-primary hover:bg-primary/90 disabled:opacity-50 transition m3-interactive"
          >
            {isPending && <MaterialIcon name="refresh" className="text-sm animate-spin" />}
            <span>タスクを作成する</span>
          </button>
        </div>
      </form>
    </M3Dialog>
  );
}

// ==========================================
// 2. 「NA を更新」簡易モーダル（F8 簡易 / M3 Dialog）
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
  const { showSnackbar } = useSnackbar();
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [nextAction, setNextAction] = useState(task?.nextAction || "");
  const [naDue, setNaDue] = useState(task?.naDue || "");
  const [status, setStatus] = useState(task?.status || "進行中");

  // タスクが変わったら初期化
  React.useEffect(() => {
    if (task) {
      setNextAction(task.nextAction || "");
      setNaDue(task.naDue || "");
      setStatus(task.status || "進行中");
      setErrorMessage(null);
    }
  }, [task]);

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
        showSnackbar({ message: "次のアクション（NA）を更新しました" });
        await onSuccess();
        onClose();
      } else {
        setErrorMessage(res.error || "NAの更新に失敗しました。");
      }
    });
  };

  return (
    <M3Dialog isOpen={isOpen} onClose={onClose} title="NA を素早く更新（F8）" maxWidth="max-w-md">
      <p className="mb-3 text-xs text-on-surface-variant line-clamp-1">{task.title}</p>

      {errorMessage && (
        <div className="mb-3 rounded-[12px] bg-error-container p-2.5 text-xs text-on-error-container flex items-center gap-2">
          <MaterialIcon name="error_outline" className="text-base text-error shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-on-surface-variant mb-1.5">
            次のアクション（NA） <span className="text-error">*</span>
          </label>
          <input
            type="text"
            value={nextAction}
            onChange={(e) => setNextAction(e.target.value)}
            className="w-full h-10 rounded-[8px] border border-outline-variant bg-surface-container-low px-3 text-xs sm:text-sm text-on-surface focus:border-primary focus:bg-surface-container-lowest focus:outline-none"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1.5">
              NA期限 <span className="text-error">*</span>
            </label>
            <input
              type="date"
              value={naDue}
              onChange={(e) => setNaDue(e.target.value)}
              className="w-full h-10 rounded-[8px] border border-outline-variant bg-surface-container-low px-3 text-xs sm:text-sm text-on-surface focus:border-primary focus:bg-surface-container-lowest focus:outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1.5">ステータス</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full h-10 rounded-[8px] border border-outline-variant bg-surface-container-low px-3 text-xs sm:text-sm text-on-surface focus:border-primary focus:bg-surface-container-lowest focus:outline-none"
            >
              <option value="未着手">未着手</option>
              <option value="進行中">進行中</option>
              <option value="待ち">待ち</option>
              <option value="完了">完了</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-outline-variant/20">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="h-9 px-4 rounded-full text-xs font-medium text-on-surface-variant hover:bg-surface-container-high transition m3-interactive"
          >
            キャンセル
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-1.5 h-9 px-5 rounded-full bg-primary text-xs font-medium text-on-primary hover:bg-primary/90 disabled:opacity-50 transition m3-interactive"
          >
            {isPending && <MaterialIcon name="refresh" className="text-sm animate-spin" />}
            <span>保存する</span>
          </button>
        </div>
      </form>
    </M3Dialog>
  );
}

// ==========================================
// 3. 変更履歴モーダル（F10 / M3 Dialog）
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
    <M3Dialog isOpen={isOpen} onClose={onClose} title="変更履歴（F10）" maxWidth="max-w-lg">
      <p className="mb-3 text-xs text-on-surface-variant line-clamp-1">{task.title}</p>

      <div className="max-h-80 overflow-y-auto space-y-2.5 pr-1">
        {logs.length === 0 ? (
          <p className="py-6 text-center text-xs text-on-surface-variant/70">変更履歴はありません。</p>
        ) : (
          logs.map((log, idx) => {
            const actor = memberMap.get(log.memberId) || log.memberId;
            return (
              <div key={idx} className="rounded-[16px] border border-outline-variant/20 bg-surface-container p-3 text-xs">
                <div className="flex items-center justify-between text-on-surface-variant text-[11px] mb-1">
                  <span>{log.timestamp ? new Date(log.timestamp).toLocaleString("ja-JP") : "-"}</span>
                  <span className="font-medium text-on-surface">{actor}</span>
                </div>
                <div className="font-normal text-on-surface">
                  操作: <span className="rounded-[4px] bg-surface-container-lowest px-1.5 py-0.5 border border-outline-variant/30 font-medium">{log.action}</span>
                </div>
                {(log.oldValue || log.newValue) && (
                  <div className="mt-1 text-on-surface-variant text-[11px] space-y-0.5">
                    {log.oldValue && <div>変更前: {log.oldValue}</div>}
                    {log.newValue && <div>変更後: {log.newValue}</div>}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="flex justify-end pt-3 border-t border-outline-variant/20 mt-4">
        <button
          onClick={onClose}
          className="h-9 px-4 rounded-full bg-surface-container-high text-xs font-medium text-on-surface hover:bg-surface-container-highest transition m3-interactive"
        >
          閉じる
        </button>
      </div>
    </M3Dialog>
  );
}
