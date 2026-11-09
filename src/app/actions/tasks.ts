"use server";

import { revalidatePath } from "next/cache";
import { requireActiveMember } from "@/lib/server-guard";
import {
  acceptAssignment,
  consultAssignment,
  determineInitialAssignment,
  reassignOrRerequest,
  OptimisticLockError,
  InvalidAssignmentTransitionError,
} from "@/lib/assignments";
import { updateTaskWithLock, appendTask, recordActivityLog } from "@/lib/tasks-repo";
import { Task, ActivityLog } from "@/lib/schemas";

export interface ActionResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  isConflict?: boolean;
}

export interface CreateTaskInput {
  title: string;
  roleIds: string;
  ownerMemberId: string;
  weight?: string;
  nextAction: string;
  naDue: string;
  taskDue?: string;
  status?: string;
  waitingOnMemberId?: string;
  priority?: string;
  blocker?: string;
  notes?: string;
}

export interface UpdateTaskInput {
  taskId: string;
  title: string;
  roleIds: string;
  ownerMemberId: string;
  weight: string;
  nextAction: string;
  naDue: string;
  taskDue: string;
  status: string;
  waitingOnMemberId: string;
  priority: string;
  blocker: string;
  notes: string;
  expectedUpdatedAt: string;
}

/**
 * タスクを新規作成する（F7 / S5 / S8）。
 * 担当者が自分以外の場合は自動的に「依頼中」ステータスになる（5.3）。
 */
function getSpreadsheetId(): string {
  const id = process.env.SPREADSHEET_ID || process.env.GOOGLE_SPREADSHEET_ID;
  if (!id) {
    throw new Error("SPREADSHEET_ID is not configured");
  }
  return id;
}

export async function createTaskAction(input: CreateTaskInput): Promise<ActionResult<Task>> {
  try {
    const { member } = await requireActiveMember();
    const spreadsheetId = getSpreadsheetId();

    const title = (input.title || "").trim();
    const nextAction = (input.nextAction || "").trim();
    const ownerMemberId = (input.ownerMemberId || "").trim();
    const naDue = (input.naDue || "").trim();
    const roleIds = (input.roleIds || "").trim();

    if (!title) throw new Error("タスク名は必須です。");
    if (!roleIds) throw new Error("役職の選択は必須です。");
    if (!ownerMemberId) throw new Error("担当者の選択は必須です。");
    if (!nextAction) throw new Error("次のアクション（NA）は必須です。");
    if (!naDue) throw new Error("NAの期限は必須です。");

    const now = new Date().toISOString();
    const taskId = crypto.randomUUID();
    const [assignmentStatus, requestedBy] = determineInitialAssignment(member.memberId, ownerMemberId);

    const newTask: Task = {
      taskId,
      title,
      roleIds,
      ownerMemberId,
      requestedBy,
      assignmentStatus,
      assignmentComment: "",
      weight: input.weight || "中",
      nextAction,
      naDue,
      taskDue: input.taskDue || "",
      status: input.status || "未着手",
      waitingOnMemberId: input.status === "待ち" ? input.waitingOnMemberId || "" : "",
      priority: input.priority || "中",
      blocker: input.blocker || "",
      notes: input.notes || "",
      source: "manual",
      meetingId: "",
      completedAt: input.status === "完了" ? now : "",
      completedBy: input.status === "完了" ? member.memberId : "",
      createdAt: now,
      createdBy: member.memberId,
      updatedAt: now,
      updatedBy: member.memberId,
      archived: false,
    };

    await appendTask(spreadsheetId, newTask);

    const log: ActivityLog = {
      timestamp: now,
      memberId: member.memberId,
      taskId,
      action: "create",
      field: "",
      oldValue: "",
      newValue: title,
    };
    await recordActivityLog(spreadsheetId, log);

    revalidatePath("/", "layout");
    return { success: true, data: newTask };
  } catch (error: any) {
    console.error("[createTaskAction] error:", error);
    return {
      success: false,
      error: error?.message || "タスクの作成に失敗しました。",
    };
  }
}

/**
 * タスクの NA・期限・ステータスを素早く更新する（F8 簡易フォーム / S7 楽観的ロック）。
 */
export async function quickUpdateNAAction(params: {
  taskId: string;
  nextAction: string;
  naDue: string;
  status: string;
  expectedUpdatedAt: string;
}): Promise<ActionResult<Task>> {
  try {
    const { member, data } = await requireActiveMember();
    const spreadsheetId = getSpreadsheetId();

    const task = data.tasks.find((t) => t.taskId === params.taskId);
    if (!task) {
      throw new Error(`タスクが見つかりません（ID: ${params.taskId}）`);
    }

    const nextAction = (params.nextAction || "").trim();
    const naDue = (params.naDue || "").trim();
    if (!nextAction) throw new Error("次のアクション（NA）は必須です。");
    if (!naDue) throw new Error("NAの期限は必須です。");

    const now = new Date().toISOString();
    const isNowCompleted = params.status === "完了" && task.status !== "完了";

    const updatedTask: Task = {
      ...task,
      nextAction,
      naDue,
      status: params.status || task.status,
      completedAt: isNowCompleted ? now : params.status !== "完了" ? "" : task.completedAt,
      completedBy: isNowCompleted ? member.memberId : params.status !== "完了" ? "" : task.completedBy,
      updatedAt: now,
      updatedBy: member.memberId,
    };

    await updateTaskWithLock(spreadsheetId, updatedTask, params.expectedUpdatedAt);

    const log: ActivityLog = {
      timestamp: now,
      memberId: member.memberId,
      taskId: task.taskId,
      action: "update",
      field: "next_action",
      oldValue: `${task.status} / ${task.naDue}`,
      newValue: `${params.status} / ${naDue}`,
    };
    await recordActivityLog(spreadsheetId, log);

    revalidatePath("/", "layout");
    return { success: true, data: updatedTask };
  } catch (error: any) {
    console.error("[quickUpdateNAAction] error:", error);
    if (error instanceof OptimisticLockError) {
      return { success: false, error: error.message, isConflict: true };
    }
    return {
      success: false,
      error: error?.message || "NAの更新に失敗しました。",
    };
  }
}

/**
 * タスクの全項目を編集する（F8 / S7 楽観的ロック / 担当変更時は再依頼）。
 */
export async function updateTaskAction(input: UpdateTaskInput): Promise<ActionResult<Task>> {
  try {
    const { member, data } = await requireActiveMember();
    const spreadsheetId = getSpreadsheetId();

    const task = data.tasks.find((t) => t.taskId === input.taskId);
    if (!task) {
      throw new Error(`タスクが見つかりません（ID: ${input.taskId}）`);
    }

    const title = (input.title || "").trim();
    const nextAction = (input.nextAction || "").trim();
    const naDue = (input.naDue || "").trim();
    const ownerMemberId = (input.ownerMemberId || "").trim();

    if (!title) throw new Error("タスク名は必須です。");
    if (!nextAction) throw new Error("次のアクション（NA）は必須です。");
    if (!naDue) throw new Error("NAの期限は必須です。");
    if (!ownerMemberId) throw new Error("担当者の選択は必須です。");

    const now = new Date().toISOString();
    let updatedTask: Task = { ...task };
    let requestLog: ActivityLog | null = null;

    // 担当者の変更チェック（5.3 / reassignOrRerequest）
    if (ownerMemberId !== task.ownerMemberId) {
      const [reassignedTask, log] = reassignOrRerequest(task, ownerMemberId, member.memberId, now);
      updatedTask = reassignedTask;
      requestLog = log;
    }

    const isNowCompleted = input.status === "完了" && task.status !== "完了";

    updatedTask = {
      ...updatedTask,
      title,
      roleIds: input.roleIds || task.roleIds,
      ownerMemberId,
      weight: input.weight || task.weight,
      nextAction,
      naDue,
      taskDue: input.taskDue || "",
      status: input.status || task.status,
      waitingOnMemberId: input.status === "待ち" ? input.waitingOnMemberId || "" : "",
      priority: input.priority || task.priority,
      blocker: input.blocker || "",
      notes: input.notes || "",
      completedAt: isNowCompleted ? now : input.status !== "完了" ? "" : task.completedAt,
      completedBy: isNowCompleted ? member.memberId : input.status !== "完了" ? "" : task.completedBy,
      updatedAt: now,
      updatedBy: member.memberId,
    };

    await updateTaskWithLock(spreadsheetId, updatedTask, input.expectedUpdatedAt);

    if (requestLog) {
      await recordActivityLog(spreadsheetId, requestLog);
    } else {
      const log: ActivityLog = {
        timestamp: now,
        memberId: member.memberId,
        taskId: task.taskId,
        action: "update",
        field: "all",
        oldValue: task.title,
        newValue: title,
      };
      await recordActivityLog(spreadsheetId, log);
    }

    revalidatePath("/", "layout");
    return { success: true, data: updatedTask };
  } catch (error: any) {
    console.error("[updateTaskAction] error:", error);
    if (error instanceof OptimisticLockError) {
      return { success: false, error: error.message, isConflict: true };
    }
    return {
      success: false,
      error: error?.message || "タスクの更新に失敗しました。",
    };
  }
}

/**
 * タスクをアーカイブする（F9 / S8: 物理削除なし）。
 */
export async function archiveTaskAction(params: {
  taskId: string;
  expectedUpdatedAt: string;
}): Promise<ActionResult<Task>> {
  try {
    const { member, data } = await requireActiveMember();
    const spreadsheetId = getSpreadsheetId();

    const task = data.tasks.find((t) => t.taskId === params.taskId);
    if (!task) {
      throw new Error(`タスクが見つかりません（ID: ${params.taskId}）`);
    }

    const now = new Date().toISOString();
    const updatedTask: Task = {
      ...task,
      archived: true,
      updatedAt: now,
      updatedBy: member.memberId,
    };

    await updateTaskWithLock(spreadsheetId, updatedTask, params.expectedUpdatedAt);

    const log: ActivityLog = {
      timestamp: now,
      memberId: member.memberId,
      taskId: task.taskId,
      action: "archive",
      field: "archived",
      oldValue: "FALSE",
      newValue: "TRUE",
    };
    await recordActivityLog(spreadsheetId, log);

    revalidatePath("/", "layout");
    return { success: true, data: updatedTask };
  } catch (error: any) {
    console.error("[archiveTaskAction] error:", error);
    if (error instanceof OptimisticLockError) {
      return { success: false, error: error.message, isConflict: true };
    }
    return {
      success: false,
      error: error?.message || "アーカイブに失敗しました。",
    };
  }
}

/**
 * タスクを復元する（F9 / S8）。
 */
export async function restoreTaskAction(params: {
  taskId: string;
  expectedUpdatedAt: string;
}): Promise<ActionResult<Task>> {
  try {
    const { member, data } = await requireActiveMember();
    const spreadsheetId = getSpreadsheetId();

    const task = data.tasks.find((t) => t.taskId === params.taskId);
    if (!task) {
      throw new Error(`タスクが見つかりません（ID: ${params.taskId}）`);
    }

    const now = new Date().toISOString();
    const updatedTask: Task = {
      ...task,
      archived: false,
      updatedAt: now,
      updatedBy: member.memberId,
    };

    await updateTaskWithLock(spreadsheetId, updatedTask, params.expectedUpdatedAt);

    const log: ActivityLog = {
      timestamp: now,
      memberId: member.memberId,
      taskId: task.taskId,
      action: "restore",
      field: "archived",
      oldValue: "TRUE",
      newValue: "FALSE",
    };
    await recordActivityLog(spreadsheetId, log);

    revalidatePath("/", "layout");
    return { success: true, data: updatedTask };
  } catch (error: any) {
    console.error("[restoreTaskAction] error:", error);
    if (error instanceof OptimisticLockError) {
      return { success: false, error: error.message, isConflict: true };
    }
    return {
      success: false,
      error: error?.message || "タスクの復元に失敗しました。",
    };
  }
}

/**
 * 依頼中のタスクを承諾する（F17 / 5.3）。担当者本人のみ実行可能。
 */
export async function acceptTaskAction(params: {
  taskId: string;
  expectedUpdatedAt: string;
}): Promise<ActionResult> {
  try {
    const { member, data } = await requireActiveMember();
    const spreadsheetId = getSpreadsheetId();

    const task = data.tasks.find((t) => t.taskId === params.taskId);
    if (!task) {
      throw new Error(`タスクが見つかりません（ID: ${params.taskId}）`);
    }

    // 担当者本人チェック（サーバー側強制）
    if (task.ownerMemberId !== member.memberId) {
      throw new Error("担当者本人以外は依頼を承諾できません。");
    }

    const now = new Date().toISOString();
    const [updatedTask, log] = acceptAssignment(task, member.memberId, now);

    // 楽観的ロック付き更新（S7）と変更履歴記録（S8）
    await updateTaskWithLock(spreadsheetId, updatedTask, params.expectedUpdatedAt);
    await recordActivityLog(spreadsheetId, log);

    revalidatePath("/", "layout");
    return { success: true, data: updatedTask };
  } catch (error: any) {
    console.error("[acceptTaskAction] error:", error);
    if (error instanceof OptimisticLockError) {
      return { success: false, error: error.message, isConflict: true };
    }
    return {
      success: false,
      error: error?.message || "依頼の承諾に失敗しました。",
    };
  }
}

/**
 * 依頼中のタスクについて「相談したい」を送信する（F17 / 5.3）。担当者本人のみ実行可能、コメント必須。
 */
export async function consultTaskAction(params: {
  taskId: string;
  comment: string;
  expectedUpdatedAt: string;
}): Promise<ActionResult> {
  try {
    const { member, data } = await requireActiveMember();
    const spreadsheetId = getSpreadsheetId();

    const task = data.tasks.find((t) => t.taskId === params.taskId);
    if (!task) {
      throw new Error(`タスクが見つかりません（ID: ${params.taskId}）`);
    }

    // 担当者本人チェック（サーバー側強制）
    if (task.ownerMemberId !== member.memberId) {
      throw new Error("担当者本人以外は「相談したい」を送信できません。");
    }

    const cleanComment = (params.comment || "").trim();
    if (!cleanComment) {
      throw new Error("「相談したい」を選択する場合はコメントを入力してください。");
    }

    const now = new Date().toISOString();
    const [updatedTask, log] = consultAssignment(task, member.memberId, cleanComment, now);

    // 楽観的ロック付き更新（S7）と変更履歴記録（S8）
    await updateTaskWithLock(spreadsheetId, updatedTask, params.expectedUpdatedAt);
    await recordActivityLog(spreadsheetId, log);

    revalidatePath("/", "layout");
    return { success: true, data: updatedTask };
  } catch (error: any) {
    console.error("[consultTaskAction] error:", error);
    if (error instanceof OptimisticLockError) {
      return { success: false, error: error.message, isConflict: true };
    }
    return {
      success: false,
      error: error?.message || "相談の送信に失敗しました。",
    };
  }
}
