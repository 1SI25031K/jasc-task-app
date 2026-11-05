import { describe, it, expect } from "vitest";
import {
  isOverdueNA,
  isDueThisWeekNA,
  calcCompletionRate,
  formatCompletionRate,
  buildHomeSummary,
  calcMemberAutoLoad,
  scaleAutoLoadsTo10,
  hasLoadGap,
} from "@/lib/services";
import { Task } from "@/lib/schemas";

function createMockTask(overrides: Partial<Task>): Task {
  return {
    taskId: "t01",
    title: "テストタスク",
    roleIds: "r01",
    ownerMemberId: "m01",
    requestedBy: "m01",
    assignmentStatus: "承諾済",
    assignmentComment: "",
    weight: "中",
    nextAction: "アクション",
    naDue: "2026-11-01",
    taskDue: "2026-11-20",
    status: "進行中",
    waitingOnMemberId: "",
    priority: "中",
    blocker: "",
    notes: "",
    source: "manual",
    meetingId: "",
    completedAt: "",
    completedBy: "",
    createdAt: "2026-11-01",
    createdBy: "m01",
    updatedAt: "2026-11-01",
    updatedBy: "m01",
    archived: false,
    ...overrides,
  };
}

describe("Services & Domain Logic", () => {
  const today = "2026-11-04";

  it("checks overdue NA status accurately", () => {
    // 期限切れ
    expect(isOverdueNA(createMockTask({ naDue: "2026-11-03", status: "進行中" }), today)).toBe(true);
    // 今日期限は期限切れではない
    expect(isOverdueNA(createMockTask({ naDue: "2026-11-04", status: "進行中" }), today)).toBe(false);
    // 完了は期限切れにならない
    expect(isOverdueNA(createMockTask({ naDue: "2026-11-01", status: "完了" }), today)).toBe(false);
    // アーカイブは期限切れにならない
    expect(isOverdueNA(createMockTask({ naDue: "2026-11-01", status: "進行中", archived: true }), today)).toBe(false);
  });

  it("checks due this week NA accurately", () => {
    // 今日〜7日後 (2026-11-04〜2026-11-11)
    expect(isDueThisWeekNA(createMockTask({ naDue: "2026-11-04" }), today)).toBe(true);
    expect(isDueThisWeekNA(createMockTask({ naDue: "2026-11-11" }), today)).toBe(true);
    expect(isDueThisWeekNA(createMockTask({ naDue: "2026-11-12" }), today)).toBe(false);
    expect(isDueThisWeekNA(createMockTask({ naDue: "2026-11-03" }), today)).toBe(false);
  });

  it("calculates completion rates", () => {
    const tasks = [
      createMockTask({ status: "完了" }),
      createMockTask({ status: "進行中" }),
      createMockTask({ status: "未着手" }),
      createMockTask({ status: "完了", archived: true }), // アーカイブは除外
    ];
    // 3件中1件完了 = 1/3 = 0.333...
    const rate = calcCompletionRate(tasks);
    expect(rate).toBeCloseTo(0.333, 2);
    expect(formatCompletionRate(rate)).toBe("33%");
    expect(formatCompletionRate(null)).toBe("—");
  });

  it("builds 1-line home summary string matching Python format", () => {
    const tasks = [
      createMockTask({ taskId: "t01", naDue: "2026-11-01", status: "進行中" }), // 期限切れ 1件
      createMockTask({ taskId: "t02", naDue: "2026-11-05", status: "進行中" }), // 今週期限 1件
      createMockTask({
        taskId: "t03",
        ownerMemberId: "m01",
        requestedBy: "m02",
        assignmentStatus: "依頼中",
        status: "未着手",
        naDue: "2026-11-20", // 将来の期限
      }), // 自分宛て依頼 1件
    ];

    const summaryJa = buildHomeSummary("m01", tasks, today, "ja");
    expect(summaryJa).toContain("期限を過ぎた NA 1件");
    expect(summaryJa).toContain("今週期限の NA 1件");
    expect(summaryJa).toContain("あなたへの依頼 1件");

    const summaryEn = buildHomeSummary("m01", tasks, today, "en");
    expect(summaryEn).toContain("1 NA past due");
    expect(summaryEn).toContain("1 NA due this week");
    expect(summaryEn).toContain("1 request for you");
  });

  it("calculates auto load points and scales to 1-10", () => {
    // 軽=1, 中=2, 重=3
    const tasks = [
      createMockTask({ ownerMemberId: "m01", weight: "重", naDue: "2026-11-05" }), // 3pt
      createMockTask({ ownerMemberId: "m01", weight: "中", naDue: "2026-11-06" }), // 2pt
      createMockTask({ ownerMemberId: "m02", weight: "軽", naDue: "2026-11-05" }), // 1pt
    ];

    const loadM01 = calcMemberAutoLoad("m01", tasks, today);
    expect(loadM01).toBe(5);

    const loadM02 = calcMemberAutoLoad("m02", tasks, today);
    expect(loadM02).toBe(1);

    const scaled = scaleAutoLoadsTo10({ m01: 5, m02: 1 });
    // 最大 5 が 10 に換算される
    expect(scaled["m01"]).toBe(10);
    // 1/5 * 10 = 2
    expect(scaled["m02"]).toBe(2);

    // 差分 4 以上でギャップ判定
    expect(hasLoadGap(scaled["m01"], 4)).toBe(true);  // |10 - 4| = 6 >= 4 -> true
    expect(hasLoadGap(scaled["m01"], 8)).toBe(false); // |10 - 8| = 2 < 4 -> false
  });
});
