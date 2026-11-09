import { google } from "googleapis";
import { getGoogleAuth } from "./google/auth";
import { appendSheetRow, updateSheetRow } from "./google/sheets";
import { Task, ActivityLog } from "./schemas";
import { OptimisticLockError } from "./assignments";

export function taskToRow(t: Task): string[] {
  return [
    t.taskId,
    t.title,
    t.roleIds || "",
    t.ownerMemberId || "",
    t.requestedBy || "",
    t.assignmentStatus || "承諾済",
    t.assignmentComment || "",
    t.weight || "中",
    t.nextAction || "",
    t.naDue || "",
    t.taskDue || "",
    t.status || "未着手",
    t.waitingOnMemberId || "",
    t.priority || "中",
    t.blocker || "",
    t.notes || "",
    t.source || "manual",
    t.meetingId || "",
    t.completedAt || "",
    t.completedBy || "",
    t.createdAt || "",
    t.createdBy || "",
    t.updatedAt || "",
    t.updatedBy || "",
    t.archived ? "TRUE" : "FALSE",
  ];
}

export function activityLogToRow(log: ActivityLog): string[] {
  return [
    log.timestamp || "",
    log.memberId || "",
    log.taskId || "",
    log.action || "",
    log.field || "",
    log.oldValue || "",
    log.newValue || "",
  ];
}

/**
 * 変更履歴を activity_log シートに 1 行追加する（S5: valueInputOption='RAW'、S8: 変更記録）。
 */
export async function recordActivityLog(
  spreadsheetId: string,
  log: ActivityLog
): Promise<void> {
  await appendSheetRow(spreadsheetId, "activity_log", activityLogToRow(log));
}

/**
 * 秒単位での ISO 日時比較（楽観的ロック用 S7）
 */
function normalizeDateForComparison(isoStr: string | null | undefined): string {
  if (!isoStr || !isoStr.trim()) return "";
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr.trim();
    // 秒単位に正規化
    d.setMilliseconds(0);
    return d.toISOString();
  } catch {
    return isoStr.trim();
  }
}

/**
 * タスクをシート上で更新する。
 * expectedUpdatedAt がシートの最新 updated_at と一致しない場合は OptimisticLockError を送出する（S7）。
 */
export async function updateTaskWithLock(
  spreadsheetId: string,
  task: Task,
  expectedUpdatedAt: string
): Promise<Task> {
  const auth = getGoogleAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "tasks!A:Z",
  });

  const rows = (res.data.values as string[][]) || [];
  if (rows.length <= 1) {
    throw new Error(`Task not found: ${task.taskId}`);
  }

  const headers = rows[0].map((h) => String(h).trim());
  const taskIdIdx = headers.indexOf("task_id");
  const updatedAtIdx = headers.indexOf("updated_at");

  if (taskIdIdx === -1) {
    throw new Error("task_id column not found in tasks sheet");
  }

  for (let idx = 1; idx < rows.length; idx++) {
    const row = rows[idx];
    if (String(row[taskIdIdx] || "").trim() === task.taskId) {
      // S7: 楽観的ロックのチェック
      const currentInSheetUpdatedAt = updatedAtIdx !== -1 ? String(row[updatedAtIdx] || "").trim() : "";
      const normalizedCurrent = normalizeDateForComparison(currentInSheetUpdatedAt);
      const normalizedExpected = normalizeDateForComparison(expectedUpdatedAt);

      if (normalizedCurrent && normalizedExpected && normalizedCurrent !== normalizedExpected) {
        throw new OptimisticLockError(
          `タスク（${task.taskId}）は他のメンバーによって先に更新されました。画面を再読み込みして最新の内容を確認してください。`
        );
      }

      // RAW で更新（S5）
      const rowData = taskToRow(task);
      await updateSheetRow(spreadsheetId, "tasks", idx + 1, rowData);
      return task;
    }
  }

  throw new Error(`Task with ID "${task.taskId}" not found in tasks sheet`);
}

/**
 * 新規タスクを tasks シートの末尾に追加する（S5）。
 */
export async function appendTask(
  spreadsheetId: string,
  task: Task
): Promise<Task> {
  await appendSheetRow(spreadsheetId, "tasks", taskToRow(task));
  return task;
}

