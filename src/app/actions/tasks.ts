"use server";

import { revalidatePath } from "next/cache";
import { requireActiveMember } from "@/lib/server-guard";
import {
  acceptAssignment,
  consultAssignment,
  OptimisticLockError,
  InvalidAssignmentTransitionError,
} from "@/lib/assignments";
import { updateTaskWithLock, recordActivityLog } from "@/lib/tasks-repo";

export interface ActionResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  isConflict?: boolean;
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
    const spreadsheetId = process.env.SPREADSHEET_ID;
    if (!spreadsheetId) {
      throw new Error("SPREADSHEET_ID is not configured");
    }

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
    const spreadsheetId = process.env.SPREADSHEET_ID;
    if (!spreadsheetId) {
      throw new Error("SPREADSHEET_ID is not configured");
    }

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
