import { z } from "zod";
import { CONFIG } from "../config";
import { batchGetSheetValues } from "../google/sheets";
import {
  MEMBER_HEADER_MAP,
  MemberSchema,
  Member,
  ROLE_HEADER_MAP,
  RoleSchema,
  Role,
  ROLE_ASSIGNMENT_HEADER_MAP,
  RoleAssignmentSchema,
  RoleAssignment,
  TASK_HEADER_MAP,
  TaskSchema,
  Task,
  CHECKIN_HEADER_MAP,
  CheckinSchema,
  Checkin,
  DAILY_SNAPSHOT_HEADER_MAP,
  DailySnapshotSchema,
  DailySnapshot,
  SETTING_HEADER_MAP,
  SettingSchema,
  Setting,
  ACTIVITY_LOG_HEADER_MAP,
  ActivityLogSchema,
  ActivityLog,
  MEETING_HEADER_MAP,
  MeetingSchema,
  Meeting,
  REMINDER_LOG_HEADER_MAP,
  ReminderLogSchema,
  ReminderLog,
} from "../schemas";

export interface InvalidRow {
  sheetName: string;
  rowIndex: number;
  raw: string[];
  reason: string;
}

export interface DashboardData {
  members: Member[];
  roles: Role[];
  roleAssignments: RoleAssignment[];
  tasks: Task[];
  checkins: Checkin[];
  dailySnapshots: DailySnapshot[];
  settings: Record<string, string>;
  activityLog: ActivityLog[];
  meetings: Meeting[];
  reminderLog: ReminderLog[];
  invalidRows: InvalidRow[];
  fetchedAt: string;
}

/**
 * シート文字列を boolean に安全変換する
 */
export function parseBoolValue(val: unknown, defaultValue = false): boolean {
  if (typeof val === "boolean") return val;
  const s = String(val ?? "").trim().toUpperCase();
  if (["TRUE", "1", "YES", "Y"].includes(s)) return true;
  if (["FALSE", "0", "NO", "N"].includes(s)) return false;
  return defaultValue;
}

/**
 * Zod の型定義から Boolean 型かどうかを判定する
 */
function isZodBooleanField(def: any): boolean {
  if (!def) return false;
  if (def.typeName === "ZodBoolean") return true;
  if (def.innerType) return isZodBooleanField(def.innerType._def || def.innerType);
  if (def.schema) return isZodBooleanField(def.schema._def || def.schema);
  return false;
}

/**
 * 2次元配列からヘッダーと Zod スキーマを用いて安全に行をパースする
 */
export function parseSheetRows<TOutput>(
  sheetName: string,
  rawRows: string[][],
  headerMap: Record<string, string>,
  schema: z.ZodType<TOutput, any, any>,
  options?: {
    inheritColumns?: string[];
  }
): { data: TOutput[]; invalidRows: InvalidRow[] } {
  const data: TOutput[] = [];
  const invalidRows: InvalidRow[] = [];

  if (!rawRows || rawRows.length === 0) {
    return { data, invalidRows };
  }

  // 1行目はヘッダー行
  const headers = rawRows[0].map((h) => String(h || "").trim());
  const headerIndexMap = new Map<string, number>();
  headers.forEach((h, idx) => {
    if (h) headerIndexMap.set(h, idx);
  });

  // 空欄継承用ステート
  const inheritCols = options?.inheritColumns || [];
  const lastInherited: Record<string, string> = {};

  // スキーマの shape 情報を取得
  const shape = (schema as any).shape || {};

  // 2行目以降がデータ行
  for (let r = 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    // 空行はスキップ
    const isBlank = !row || row.every((c) => !String(c || "").trim());
    if (isBlank) continue;

    const record: Record<string, any> = {};

    for (const [headerKey, targetField] of Object.entries(headerMap)) {
      const colIdx = headerIndexMap.get(headerKey);
      let rawVal = colIdx !== undefined && colIdx < row.length ? row[colIdx] : "";
      rawVal = String(rawVal ?? "").trim();

      // 空欄の継承処理
      if (inheritCols.includes(targetField)) {
        if (!rawVal && lastInherited[targetField]) {
          rawVal = lastInherited[targetField];
        } else if (rawVal) {
          lastInherited[targetField] = rawVal;
        }
      }

      // 列が存在しないか空文字列の場合は undefined にして Zod の default/optional を適用
      if (colIdx === undefined || rawVal === "") {
        record[targetField] = undefined;
      } else {
        // ブール値フィールドの場合は真偽値に変換
        const fieldDef = shape[targetField]?._def;
        if (fieldDef && isZodBooleanField(fieldDef)) {
          record[targetField] = parseBoolValue(rawVal);
        } else {
          record[targetField] = rawVal;
        }
      }
    }

    const parseResult = schema.safeParse(record);
    if (parseResult.success) {
      data.push(parseResult.data);
    } else {
      const issueMsgs = parseResult.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
      invalidRows.push({
        sheetName,
        rowIndex: r + 1,
        raw: row,
        reason: issueMsgs,
      });
    }
  }

  return { data, invalidRows };
}

/**
 * 全10シートの生データをダッシュボードデータ構造へ整形する
 */
export function transformSheetData(rawSheets: Record<string, string[][]>): DashboardData {
  const allInvalidRows: InvalidRow[] = [];

  const { data: members, invalidRows: invMembers } = parseSheetRows(
    CONFIG.sheets.members,
    rawSheets[CONFIG.sheets.members] || [],
    MEMBER_HEADER_MAP,
    MemberSchema
  );
  allInvalidRows.push(...invMembers);

  const { data: roles, invalidRows: invRoles } = parseSheetRows(
    CONFIG.sheets.roles,
    rawSheets[CONFIG.sheets.roles] || [],
    ROLE_HEADER_MAP,
    RoleSchema
  );
  allInvalidRows.push(...invRoles);

  const { data: roleAssignments, invalidRows: invRoleAssignments } = parseSheetRows(
    CONFIG.sheets.roleAssignments,
    rawSheets[CONFIG.sheets.roleAssignments] || [],
    ROLE_ASSIGNMENT_HEADER_MAP,
    RoleAssignmentSchema
  );
  allInvalidRows.push(...invRoleAssignments);

  const { data: tasks, invalidRows: invTasks } = parseSheetRows(
    CONFIG.sheets.tasks,
    rawSheets[CONFIG.sheets.tasks] || [],
    TASK_HEADER_MAP,
    TaskSchema
  );
  allInvalidRows.push(...invTasks);

  const { data: checkins, invalidRows: invCheckins } = parseSheetRows(
    CONFIG.sheets.checkins,
    rawSheets[CONFIG.sheets.checkins] || [],
    CHECKIN_HEADER_MAP,
    CheckinSchema
  );
  allInvalidRows.push(...invCheckins);

  const { data: dailySnapshots, invalidRows: invSnapshots } = parseSheetRows(
    CONFIG.sheets.dailySnapshots,
    rawSheets[CONFIG.sheets.dailySnapshots] || [],
    DAILY_SNAPSHOT_HEADER_MAP,
    DailySnapshotSchema
  );
  allInvalidRows.push(...invSnapshots);

  const { data: rawSettings, invalidRows: invSettings } = parseSheetRows(
    CONFIG.sheets.settings,
    rawSheets[CONFIG.sheets.settings] || [],
    SETTING_HEADER_MAP,
    SettingSchema
  );
  allInvalidRows.push(...invSettings);

  const settingsMap: Record<string, string> = {};
  for (const s of rawSettings) {
    settingsMap[s.key] = s.value ?? "";
  }

  const { data: activityLog, invalidRows: invActivity } = parseSheetRows(
    CONFIG.sheets.activityLog,
    rawSheets[CONFIG.sheets.activityLog] || [],
    ACTIVITY_LOG_HEADER_MAP,
    ActivityLogSchema
  );
  allInvalidRows.push(...invActivity);

  const { data: meetings, invalidRows: invMeetings } = parseSheetRows(
    CONFIG.sheets.meetings,
    rawSheets[CONFIG.sheets.meetings] || [],
    MEETING_HEADER_MAP,
    MeetingSchema
  );
  allInvalidRows.push(...invMeetings);

  const { data: reminderLog, invalidRows: invReminders } = parseSheetRows(
    CONFIG.sheets.reminderLog,
    rawSheets[CONFIG.sheets.reminderLog] || [],
    REMINDER_LOG_HEADER_MAP,
    ReminderLogSchema
  );
  allInvalidRows.push(...invReminders);

  return {
    members,
    roles,
    roleAssignments,
    tasks,
    checkins,
    dailySnapshots,
    settings: settingsMap,
    activityLog,
    meetings,
    reminderLog,
    invalidRows: allInvalidRows,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Google Sheets から全ダッシュボードデータを取得して整形する
 */
export async function fetchDashboardData(spreadsheetId = process.env.SPREADSHEET_ID): Promise<DashboardData> {
  if (!spreadsheetId) {
    throw new Error("SPREADSHEET_ID environment variable is missing");
  }

  const sheetNames = [
    CONFIG.sheets.members,
    CONFIG.sheets.roles,
    CONFIG.sheets.roleAssignments,
    CONFIG.sheets.tasks,
    CONFIG.sheets.checkins,
    CONFIG.sheets.dailySnapshots,
    CONFIG.sheets.settings,
    CONFIG.sheets.activityLog,
    CONFIG.sheets.meetings,
    CONFIG.sheets.reminderLog,
  ];

  const rawSheets = await batchGetSheetValues(spreadsheetId, sheetNames);
  return transformSheetData(rawSheets);
}
