import { describe, it, expect } from "vitest";
import { taskToRow, activityLogToRow } from "@/lib/tasks-repo";
import { Task, ActivityLog } from "@/lib/schemas";
import { determineInitialAssignment } from "@/lib/assignments";

describe("Batch 3: Task CRUD, Archiving & History (F7 / F8 / F9 / F10)", () => {
  const sampleTask: Task = {
    taskId: "t-100",
    title: "春合宿の会場確保",
    roleIds: "r_spring,r_logistics",
    ownerMemberId: "m002",
    requestedBy: "m001",
    assignmentStatus: "依頼中",
    assignmentComment: "",
    weight: "重",
    nextAction: "会場下見の候補日リスト作成",
    naDue: "2026-11-20",
    taskDue: "2026-11-30",
    status: "進行中",
    waitingOnMemberId: "",
    priority: "高",
    blocker: "",
    notes: "日程調整中",
    source: "manual",
    meetingId: "",
    completedAt: "",
    completedBy: "",
    createdAt: "2026-11-09T00:00:00.000Z",
    createdBy: "m001",
    updatedAt: "2026-11-09T01:00:00.000Z",
    updatedBy: "m001",
    archived: false,
  };

  it("serializes Task to sheet row matching sheets_repository.py (S5 / RAW)", () => {
    const row = taskToRow(sampleTask);
    expect(row).toEqual([
      "t-100",
      "春合宿の会場確保",
      "r_spring,r_logistics",
      "m002",
      "m001",
      "依頼中",
      "",
      "重",
      "会場下見の候補日リスト作成",
      "2026-11-20",
      "2026-11-30",
      "進行中",
      "",
      "高",
      "",
      "日程調整中",
      "manual",
      "",
      "",
      "",
      "2026-11-09T00:00:00.000Z",
      "m001",
      "2026-11-09T01:00:00.000Z",
      "m001",
      "FALSE",
    ]);
  });

  it("serializes ActivityLog to sheet row", () => {
    const log: ActivityLog = {
      timestamp: "2026-11-09T01:00:00.000Z",
      memberId: "m001",
      taskId: "t-100",
      action: "create",
      field: "",
      oldValue: "",
      newValue: "春合宿の会場確保",
    };
    const row = activityLogToRow(log);
    expect(row).toEqual([
      "2026-11-09T01:00:00.000Z",
      "m001",
      "t-100",
      "create",
      "",
      "",
      "春合宿の会場確保",
    ]);
  });

  it("assigns correct assignment_status when creating a task (5.3)", () => {
    // 自分を担当者に指定 -> 承諾済
    const [selfStatus, selfReq] = determineInitialAssignment("m001", "m001");
    expect(selfStatus).toBe("承諾済");
    expect(selfReq).toBe("");

    // 他人を担当者に指定 -> 依頼中
    const [otherStatus, otherReq] = determineInitialAssignment("m001", "m002");
    expect(otherStatus).toBe("依頼中");
    expect(otherReq).toBe("m001");
  });

  it("supports soft delete archiving (S8)", () => {
    const archivedTask: Task = { ...sampleTask, archived: true };
    const row = taskToRow(archivedTask);
    expect(row[24]).toBe("TRUE");
  });
});
