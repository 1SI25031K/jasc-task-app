import { describe, it, expect } from "vitest";
import {
  parseBoolValue,
  parseSheetRows,
  transformSheetData,
} from "@/lib/data";
import {
  MEMBER_HEADER_MAP,
  MemberSchema,
  ROLE_HEADER_MAP,
  RoleSchema,
  TASK_HEADER_MAP,
  TaskSchema,
} from "@/lib/schemas";
import { CONFIG } from "@/lib/config";

describe("Data Layer Parsing & Validation", () => {
  describe("parseBoolValue", () => {
    it("converts truthy values to true", () => {
      expect(parseBoolValue("TRUE")).toBe(true);
      expect(parseBoolValue("true")).toBe(true);
      expect(parseBoolValue("1")).toBe(true);
      expect(parseBoolValue("YES")).toBe(true);
      expect(parseBoolValue(true)).toBe(true);
    });

    it("converts falsy values to false", () => {
      expect(parseBoolValue("FALSE")).toBe(false);
      expect(parseBoolValue("false")).toBe(false);
      expect(parseBoolValue("0")).toBe(false);
      expect(parseBoolValue("NO")).toBe(false);
      expect(parseBoolValue(false)).toBe(false);
      expect(parseBoolValue("")).toBe(false);
    });
  });

  describe("parseSheetRows with Column Independence", () => {
    it("parses rows correctly and is immune to column reordering", () => {
      // 順序 A: member_id, display_name, email, active
      const rowsA = [
        ["member_id", "display_name", "email", "active"],
        ["m01", "山田太郎", "yamada@jasc.org", "TRUE"],
      ];

      // 順序 B: active, email, member_id, display_name (列を入れ替え)
      const rowsB = [
        ["active", "email", "member_id", "display_name"],
        ["TRUE", "yamada@jasc.org", "m01", "山田太郎"],
      ];

      const resA = parseSheetRows("members", rowsA, MEMBER_HEADER_MAP, MemberSchema);
      const resB = parseSheetRows("members", rowsB, MEMBER_HEADER_MAP, MemberSchema);

      expect(resA.invalidRows).toHaveLength(0);
      expect(resB.invalidRows).toHaveLength(0);
      expect(resA.data[0]).toEqual(resB.data[0]);
      expect(resA.data[0].memberId).toBe("m01");
      expect(resA.data[0].displayName).toBe("山田太郎");
      expect(resA.data[0].email).toBe("yamada@jasc.org");
      expect(resA.data[0].active).toBe(true);
    });

    it("captures invalid rows in invalidRows without throwing exceptions", () => {
      const rows = [
        ["member_id", "display_name", "email"],
        ["m01", "山田太郎", "yamada@jasc.org"],
        ["", "名前なしID欠落", "invalid@jasc.org"], // member_id が空
        ["m03", "", "no_name@jasc.org"],           // display_name が空
      ];

      const res = parseSheetRows("members", rows, MEMBER_HEADER_MAP, MemberSchema);

      expect(res.data).toHaveLength(1);
      expect(res.data[0].memberId).toBe("m01");

      // 壊れた 2 行が invalidRows に記録されていること
      expect(res.invalidRows).toHaveLength(2);
      expect(res.invalidRows[0].rowIndex).toBe(3);
      expect(res.invalidRows[0].sheetName).toBe("members");
      expect(res.invalidRows[0].reason).toContain("member_id is required");

      expect(res.invalidRows[1].rowIndex).toBe(4);
      expect(res.invalidRows[1].reason).toContain("display_name is required");
    });

    it("skips blank rows cleanly", () => {
      const rows = [
        ["member_id", "display_name"],
        ["m01", "山田太郎"],
        ["", ""], // 完全な空行
        ["   ", "  "], // 空白行
      ];

      const res = parseSheetRows("members", rows, MEMBER_HEADER_MAP, MemberSchema);
      expect(res.data).toHaveLength(1);
      expect(res.invalidRows).toHaveLength(0);
    });
  });

  describe("transformSheetData for All 10 Sheets", () => {
    it("transforms all 10 sheets accurately into DashboardData", () => {
      const mockRawSheets = {
        [CONFIG.sheets.members]: [
          ["member_id", "display_name", "email", "active"],
          ["m01", "山田太郎", "yamada@jasc.org", "TRUE"],
        ],
        [CONFIG.sheets.roles]: [
          ["role_id", "name", "category", "sort_order"],
          ["r01", "委員長", "主役職", "1"],
        ],
        [CONFIG.sheets.roleAssignments]: [
          ["role_id", "member_id", "kind"],
          ["r01", "m01", "責任者"],
        ],
        [CONFIG.sheets.tasks]: [
          ["task_id", "title", "owner_member_id", "weight", "na_due", "status", "archived"],
          ["t01", "会場下見", "m01", "重", "2026-11-10", "進行中", "FALSE"],
        ],
        [CONFIG.sheets.checkins]: [
          ["checkin_id", "member_id", "date", "score", "comment"],
          ["c01", "m01", "2026-11-04", "7", "順調です"],
        ],
        [CONFIG.sheets.dailySnapshots]: [
          ["date", "scope_type", "scope_id", "total", "done", "open", "overdue"],
          ["2026-11-04", "ALL", "ALL", "10", "4", "6", "1"],
        ],
        [CONFIG.sheets.settings]: [
          ["key", "value"],
          ["load_window_days", "14"],
          ["high_load_score", "7"],
        ],
        [CONFIG.sheets.activityLog]: [
          ["timestamp", "member_id", "task_id", "action"],
          ["2026-11-04 10:00:00", "m01", "t01", "update"],
        ],
        [CONFIG.sheets.meetings]: [
          ["meeting_id", "meeting_date", "title"],
          ["mtg01", "2026-11-01", "第1回全体会議"],
        ],
        [CONFIG.sheets.reminderLog]: [
          ["sent_at", "member_id", "kind", "task_id"],
          ["2026-11-04 08:00:00", "m01", "due_today", "t01"],
        ],
      };

      const dashboard = transformSheetData(mockRawSheets);

      expect(dashboard.members).toHaveLength(1);
      expect(dashboard.members[0].memberId).toBe("m01");
      expect(dashboard.roles).toHaveLength(1);
      expect(dashboard.roles[0].name).toBe("委員長");
      expect(dashboard.roleAssignments).toHaveLength(1);
      expect(dashboard.tasks).toHaveLength(1);
      expect(dashboard.tasks[0].title).toBe("会場下見");
      expect(dashboard.tasks[0].weight).toBe("重");
      expect(dashboard.checkins).toHaveLength(1);
      expect(dashboard.checkins[0].score).toBe(7);
      expect(dashboard.dailySnapshots).toHaveLength(1);
      expect(dashboard.settings["load_window_days"]).toBe("14");
      expect(dashboard.activityLog).toHaveLength(1);
      expect(dashboard.meetings).toHaveLength(1);
      expect(dashboard.reminderLog).toHaveLength(1);
      expect(dashboard.invalidRows).toHaveLength(0);
      expect(dashboard.fetchedAt).toBeDefined();
    });
  });
});

