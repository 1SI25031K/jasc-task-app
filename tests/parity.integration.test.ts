import { describe, it, expect } from "vitest";
import { fetchDashboardData } from "@/lib/data";
import {
  getOverdueTasks,
  getDueThisWeekTasks,
  calcCompletionRate,
  formatCompletionRate,
  calcMemberAutoLoad,
  scaleAutoLoadsTo10,
  getLatestCheckin,
  hasLoadGap,
  buildHomeSummary,
} from "@/lib/services";
import { getTodayJST } from "@/lib/time";

describe("Live Parity Verification (Python vs TypeScript)", () => {
  it.skipIf(process.env.TEST_LIVE_SHEETS !== "true")(
    "produces 100% identical metrics to Python implementation",
    async () => {
      const data = await fetchDashboardData();
      const today = getTodayJST();

      const activeMembers = data.members.filter((m) => m.active);
      const activeRoles = data.roles.filter((r) => r.active);
      const activeTasks = data.tasks.filter((t) => !t.archived);

      const overdueTasks = getOverdueTasks(data.tasks, today);
      const dueWeekTasks = getDueThisWeekTasks(data.tasks, today);
      const rate = calcCompletionRate(data.tasks);

      const autoLoads: Record<string, number> = {};
      for (const m of activeMembers) {
        autoLoads[m.memberId] = calcMemberAutoLoad(m.memberId, data.tasks, today);
      }
      const scaledLoads = scaleAutoLoadsTo10(autoLoads);

      const gaps: string[] = [];
      for (const m of activeMembers) {
        const { checkin, isFresh } = getLatestCheckin(m.memberId, data.checkins, today);
        const subj = checkin && isFresh ? checkin.score : null;
        if (hasLoadGap(scaledLoads[m.memberId] ?? 1, subj)) {
          gaps.push(m.displayName);
        }
      }

      console.log("=== TypeScript 版の算出結果 ===");
      console.log(
        JSON.stringify(
          {
            today,
            active_members_count: activeMembers.length,
            active_roles_count: activeRoles.length,
            active_tasks_count: activeTasks.length,
            overdue_tasks_count: overdueTasks.length,
            due_week_tasks_count: dueWeekTasks.length,
            completion_rate: formatCompletionRate(rate),
            members_with_load_gap: gaps,
            sample_home_summary_ja: buildHomeSummary(activeMembers[0]?.memberId || "", data.tasks, today, "ja"),
            auto_loads: autoLoads,
            scaled_loads: scaledLoads,
          },
          null,
          2
        )
      );

      // Python 算出結果との完全一致アサーション
      expect(activeMembers.length).toBe(8);
      expect(activeRoles.length).toBe(21);
      expect(activeTasks.length).toBe(30);
      expect(overdueTasks.length).toBe(4);
      expect(dueWeekTasks.length).toBe(13);
      expect(formatCompletionRate(rate)).toBe("17%");
      expect(gaps).toEqual(["莉子"]);
      expect(autoLoads).toEqual({
        m001: 11,
        m002: 5,
        m003: 11,
        m004: 5,
        m005: 6,
        m006: 6,
        m007: 1,
        m008: 3,
      });
      expect(scaledLoads).toEqual({
        m001: 10,
        m002: 5,
        m003: 10,
        m004: 5,
        m005: 5,
        m006: 5,
        m007: 1,
        m008: 3,
      });
      expect(buildHomeSummary(activeMembers[0].memberId, data.tasks, today, "ja")).toBe(
        "期限を過ぎた NA 4件 ・ 今週期限の NA 13件 ・ あなたへの依頼 1件"
      );
    }
  );
});
