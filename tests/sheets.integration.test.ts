import { describe, it, expect } from "vitest";
import { fetchDashboardData } from "@/lib/data";

describe("Live Google Sheets Integration", () => {
  it.skipIf(process.env.TEST_LIVE_SHEETS !== "true")(
    "fetches and validates live spreadsheet data",
    async () => {
      const data = await fetchDashboardData();
      expect(data).toBeDefined();
      expect(data.members).toBeInstanceOf(Array);
      expect(data.roles).toBeInstanceOf(Array);
      expect(data.tasks).toBeInstanceOf(Array);
      console.log(`Live data fetched successfully: ${data.members.length} members, ${data.roles.length} roles, ${data.tasks.length} tasks, ${data.invalidRows.length} invalid rows.`);
    }
  );
});
