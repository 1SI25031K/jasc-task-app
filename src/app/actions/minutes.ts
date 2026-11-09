"use server";

import { revalidatePath } from "next/cache";
import { requireActiveMember } from "@/lib/server-guard";
import { fetchDashboardData } from "@/lib/data";
import {
  extractNaCandidates,
  NaCandidate,
  isCandidateReadyToSave,
} from "@/lib/gemini";
import { determineInitialAssignment } from "@/lib/assignments";
import { appendTask, recordActivityLog } from "@/lib/tasks-repo";
import { appendMeeting } from "@/lib/meetings-repo";
import { Task, ActivityLog } from "@/lib/schemas";
import { Meeting } from "@/lib/schemas/meetings";

export interface ExtractActionResult {
  success: boolean;
  candidates?: NaCandidate[];
  error?: string;
}

export interface SaveExtractedTasksResult {
  success: boolean;
  savedCount?: number;
  error?: string;
}

export async function extractNaAction(
  minutesText: string,
  meetingDate: string
): Promise<ExtractActionResult> {
  try {
    const auth = await requireActiveMember();
    const data = await fetchDashboardData();

    const candidates = await extractNaCandidates(
      minutesText,
      meetingDate,
      data.roles,
      data.members,
      auth.member.memberId
    );

    return {
      success: true,
      candidates,
    };
  } catch (err: any) {
    console.error("extractNaAction error:", err);
    return {
      success: false,
      error: err.message || "NA候補の抽出に失敗しました。",
    };
  }
}

export interface SaveExtractedTasksInput {
  meetingDate: string;
  meetingTitle: string;
  totalGenerated: number;
  candidates: NaCandidate[];
}

export async function saveExtractedTasksAction(
  input: SaveExtractedTasksInput
): Promise<SaveExtractedTasksResult> {
  try {
    const auth = await requireActiveMember();
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    if (!spreadsheetId) {
      return { success: false, error: "GOOGLE_SPREADSHEET_ID is not configured" };
    }

    if (input.candidates.length === 0) {
      return { success: false, error: "登録する候補が選択されていません。" };
    }

    // 各候補が必須項目を満たしているかチェック
    for (const cand of input.candidates) {
      if (!isCandidateReadyToSave(cand)) {
        return {
          success: false,
          error: `「${cand.title || "無題"}」の必須項目（タイトル・NA・担当者・役職・期限）が不足しています。`,
        };
      }
    }

    const now = new Date();
    const nowIso = now.toISOString().replace(/\.\d{3}Z$/, "Z");
    const meetingId = `mtg_${Math.random().toString(36).substring(2, 8)}`;

    let savedCount = 0;

    for (const cand of input.candidates) {
      const taskId = `t_${Math.random().toString(36).substring(2, 8)}`;
      const [assignmentStatus, requestedBy] = determineInitialAssignment(
        auth.member.memberId,
        cand.ownerMemberId
      );

      const newTask: Task = {
        taskId,
        title: cand.title.trim(),
        roleIds: cand.roleIds.join(","),
        ownerMemberId: cand.ownerMemberId,
        requestedBy,
        assignmentStatus,
        assignmentComment: "",
        weight: cand.weight,
        nextAction: cand.nextAction.trim(),
        naDue: cand.naDue,
        taskDue: "",
        status: "未着手",
        waitingOnMemberId: "",
        priority: "中",
        blocker: "",
        notes: cand.evidence ? `【議事メモ根拠】: ${cand.evidence}` : "",
        source: "minutes",
        meetingId,
        completedAt: "",
        completedBy: "",
        createdAt: nowIso,
        createdBy: auth.member.memberId,
        updatedAt: nowIso,
        updatedBy: auth.member.memberId,
        archived: false,
      };

      await appendTask(spreadsheetId, newTask);

      const createLog: ActivityLog = {
        timestamp: nowIso,
        memberId: auth.member.memberId,
        taskId,
        action: "create",
        field: "",
        oldValue: "",
        newValue: newTask.title,
      };
      await recordActivityLog(spreadsheetId, createLog);

      if (assignmentStatus === "依頼中") {
        const assignLog: ActivityLog = {
          timestamp: nowIso,
          memberId: auth.member.memberId,
          taskId,
          action: "request",
          field: "assignment_status",
          oldValue: "",
          newValue: "依頼中",
        };
        await recordActivityLog(spreadsheetId, assignLog);
      }

      savedCount++;
    }

    // meetings シートに記録
    const meetingRecord: Meeting = {
      meetingId,
      meetingDate: input.meetingDate,
      title: input.meetingTitle.trim() || "定例会",
      createdBy: auth.member.memberId,
      createdAt: nowIso,
      generatedCount: input.totalGenerated,
      savedCount,
    };
    await appendMeeting(spreadsheetId, meetingRecord);

    revalidatePath("/", "layout");

    return {
      success: true,
      savedCount,
    };
  } catch (err: any) {
    console.error("saveExtractedTasksAction error:", err);
    return {
      success: false,
      error: err.message || "タスクの一括登録に失敗しました。",
    };
  }
}
