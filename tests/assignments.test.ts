import { describe, it, expect } from "vitest";
import {
  determineInitialAssignment,
  acceptAssignment,
  consultAssignment,
  reassignOrRerequest,
  InvalidAssignmentTransitionError,
} from "@/lib/assignments";
import { Task } from "@/lib/schemas";

describe("Batch 2: Task Assignment & State Transitions (5.3 / F17)", () => {
  const baseTask: Task = {
    taskId: "t001",
    title: "予算案の作成",
    roleIds: "r_finance",
    ownerMemberId: "m002",
    requestedBy: "m001",
    assignmentStatus: "依頼中",
    assignmentComment: "",
    weight: "中",
    nextAction: "スプレッドシートに入力",
    naDue: "2026-11-15",
    taskDue: "2026-11-20",
    status: "未着手",
    waitingOnMemberId: "",
    priority: "中",
    blocker: "",
    notes: "",
    source: "manual",
    meetingId: "",
    completedAt: "",
    completedBy: "",
    createdAt: "2026-11-09T00:00:00.000Z",
    createdBy: "m001",
    updatedAt: "2026-11-09T00:00:00.000Z",
    updatedBy: "m001",
    archived: false,
  };

  describe("determineInitialAssignment", () => {
    it("returns '承諾済' and empty requestedBy when assigning to self", () => {
      const [status, reqBy] = determineInitialAssignment("m001", "m001");
      expect(status).toBe("承諾済");
      expect(reqBy).toBe("");
    });

    it("returns '依頼中' and creatorId when assigning to someone else", () => {
      const [status, reqBy] = determineInitialAssignment("m001", "m002");
      expect(status).toBe("依頼中");
      expect(reqBy).toBe("m001");
    });

    it("throws error if creator or owner is empty", () => {
      expect(() => determineInitialAssignment("", "m002")).toThrow(InvalidAssignmentTransitionError);
      expect(() => determineInitialAssignment("m001", "")).toThrow(InvalidAssignmentTransitionError);
    });
  });

  describe("acceptAssignment", () => {
    it("allows owner to accept pending task and logs activity (S8)", () => {
      const now = "2026-11-09T01:00:00.000Z";
      const [updated, log] = acceptAssignment(baseTask, "m002", now);

      expect(updated.assignmentStatus).toBe("承諾済");
      expect(updated.updatedAt).toBe(now);
      expect(updated.updatedBy).toBe("m002");

      expect(log).toEqual({
        timestamp: now,
        memberId: "m002",
        taskId: "t001",
        action: "accept",
        field: "assignment_status",
        oldValue: "依頼中",
        newValue: "承諾済",
      });
    });

    it("rejects accept attempt by someone other than the owner", () => {
      expect(() => acceptAssignment(baseTask, "m001")).toThrow("担当者本人以外は依頼を承諾できません。");
      expect(() => acceptAssignment(baseTask, "stranger")).toThrow("担当者本人以外は依頼を承諾できません。");
    });

    it("rejects accept if status is not '依頼中'", () => {
      const acceptedTask = { ...baseTask, assignmentStatus: "承諾済" };
      expect(() => acceptAssignment(acceptedTask, "m002")).toThrow(/現在の状態が「承諾済」のため承諾できません/);
    });

    it("rejects accept if task is archived", () => {
      const archivedTask = { ...baseTask, archived: true };
      expect(() => acceptAssignment(archivedTask, "m002")).toThrow("アーカイブされたタスクの依頼は承諾できません。");
    });
  });

  describe("consultAssignment", () => {
    it("allows owner to consult with a comment and logs activity", () => {
      const now = "2026-11-09T02:00:00.000Z";
      const comment = "今週はテスト期間のため来週着手でもよいでしょうか？";
      const [updated, log] = consultAssignment(baseTask, "m002", comment, now);

      expect(updated.assignmentStatus).toBe("相談中");
      expect(updated.assignmentComment).toBe(comment);
      expect(updated.updatedAt).toBe(now);

      expect(log).toEqual({
        timestamp: now,
        memberId: "m002",
        taskId: "t001",
        action: "consult",
        field: "assignment_status",
        oldValue: "依頼中",
        newValue: "相談中",
      });
    });

    it("requires non-empty comment for consult", () => {
      expect(() => consultAssignment(baseTask, "m002", "")).toThrow("コメントが必須です");
      expect(() => consultAssignment(baseTask, "m002", "   ")).toThrow("コメントが必須です");
    });

    it("rejects consult attempt by non-owner", () => {
      expect(() => consultAssignment(baseTask, "m001", "相談")).toThrow("担当者本人以外は「相談したい」を選択できません。");
    });
  });

  describe("reassignOrRerequest", () => {
    it("allows re-requesting after consultation", () => {
      const consultedTask = { ...baseTask, assignmentStatus: "相談中", assignmentComment: "調整希望" };
      const now = "2026-11-09T03:00:00.000Z";
      const [updated, log] = reassignOrRerequest(consultedTask, "m002", "m001", now);

      expect(updated.assignmentStatus).toBe("依頼中");
      expect(updated.assignmentComment).toBe("");
      expect(updated.requestedBy).toBe("m001");
      expect(log.action).toBe("request");
    });

    it("allows reassigning to a different member", () => {
      const now = "2026-11-09T03:00:00.000Z";
      const [updated, log] = reassignOrRerequest(baseTask, "m003", "m001", now);

      expect(updated.ownerMemberId).toBe("m003");
      expect(updated.assignmentStatus).toBe("依頼中");
      expect(log.action).toBe("request");
    });
  });
});

