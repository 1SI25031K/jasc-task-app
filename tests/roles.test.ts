import { describe, it, expect } from "vitest";
import { calcCompletionRate, formatCompletionRate } from "@/lib/services";
import { Task } from "@/lib/schemas/tasks";

describe("Role Detail & Board Calculations (4. 役職詳細確認)", () => {
  it("filters tasks by roleId and calculates completion rate accurately", () => {
    const mockTasks: Task[] = [
      {
        taskId: "t_1",
        title: "プログラム設計",
        roleIds: "r_prog, r_lead",
        ownerMemberId: "m_alice",
        requestedBy: "m_alice",
        assignmentStatus: "承諾済",
        assignmentComment: "",
        weight: "中",
        nextAction: "ドラフト作成",
        naDue: "2026-11-15",
        taskDue: "2026-11-20",
        status: "進行中",
        waitingOnMemberId: "",
        priority: "高",
        blocker: "",
        notes: "",
        source: "manual",
        meetingId: "",
        completedAt: "",
        completedBy: "",
        createdAt: "2026-11-01T00:00:00Z",
        createdBy: "m_alice",
        updatedAt: "2026-11-01T00:00:00Z",
        updatedBy: "m_alice",
        archived: false,
      },
      {
        taskId: "t_2",
        title: "タイムテーブル調整",
        roleIds: "r_prog",
        ownerMemberId: "m_alice",
        requestedBy: "m_alice",
        assignmentStatus: "承諾済",
        assignmentComment: "",
        weight: "軽",
        nextAction: "完了確認",
        naDue: "2026-11-10",
        taskDue: "2026-11-12",
        status: "完了",
        waitingOnMemberId: "",
        priority: "通常",
        blocker: "",
        notes: "",
        source: "manual",
        meetingId: "",
        completedAt: "2026-11-08T00:00:00Z",
        completedBy: "m_alice",
        createdAt: "2026-11-01T00:00:00Z",
        createdBy: "m_alice",
        updatedAt: "2026-11-08T00:00:00Z",
        updatedBy: "m_alice",
        archived: false,
      },
      {
        taskId: "t_3",
        title: "会計予算策定",
        roleIds: "r_treasury",
        ownerMemberId: "m_bob",
        requestedBy: "m_bob",
        assignmentStatus: "承諾済",
        assignmentComment: "",
        weight: "重",
        nextAction: "見積精査",
        naDue: "2026-11-14",
        taskDue: "2026-11-18",
        status: "進行中",
        waitingOnMemberId: "",
        priority: "通常",
        blocker: "",
        notes: "",
        source: "manual",
        meetingId: "",
        completedAt: "",
        completedBy: "",
        createdAt: "2026-11-01T00:00:00Z",
        createdBy: "m_bob",
        updatedAt: "2026-11-01T00:00:00Z",
        updatedBy: "m_bob",
        archived: false,
      },
    ];

    // r_prog に所属するタスク (t_1 と t_2)
    const progTasks = mockTasks.filter((t) =>
      t.roleIds.split(",").map((s) => s.trim()).includes("r_prog")
    );
    expect(progTasks).toHaveLength(2);

    const completionRate = calcCompletionRate(progTasks);
    // 2件中1件完了 = 50%
    expect(completionRate).toBe(0.5);
    expect(formatCompletionRate(completionRate)).toBe("50%");
  });

  it("handles empty tasks for a role safely", () => {
    const rate = calcCompletionRate([]);
    expect(rate).toBeNull();
    expect(formatCompletionRate(rate)).toBe("—");
  });
});
