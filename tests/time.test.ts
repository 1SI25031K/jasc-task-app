import { describe, it, expect } from "vitest";
import { parseFuzzyDate, isOverdue, isDueThisWeek, isStale, getGreetingKey } from "@/lib/time";

describe("Time & Date Utilities", () => {
  it("parses ISO YYYY-MM-DD correctly", () => {
    const res = parseFuzzyDate("2026-11-04");
    expect(res.dateString).toBe("2026-11-04");
    expect(res.parsedDate).not.toBeNull();
  });

  it("handles academic year boundary for M/D format (starts 2026-09)", () => {
    // 9月は 2026年
    const resSep = parseFuzzyDate("9/2", "2026-09");
    expect(resSep.dateString).toBe("2026-09-02");

    // 12月は 2026年
    const resDec = parseFuzzyDate("12/25", "2026-09");
    expect(resDec.dateString).toBe("2026-12-25");

    // 2月は 2027年
    const resFeb = parseFuzzyDate("2/15", "2026-09");
    expect(resFeb.dateString).toBe("2027-02-15");
  });

  it("extracts date from multiline or combined date strings", () => {
    // 複数日 (10/1\n10/2)
    const multiline = parseFuzzyDate("10/1\n10/2", "2026-09");
    expect(multiline.dateString).toBe("2026-10-01");

    // 日付 + テキスト (1/14-17 第１次選考合宿)
    const textCombined = parseFuzzyDate("1/14-17　第１次選考合宿", "2026-09");
    expect(textCombined.dateString).toBe("2027-01-14");
    expect(textCombined.rawString).toBe("1/14-17　第１次選考合宿");
  });

  it("preserves unparseable strings without crashing", () => {
    const unparseable = parseFuzzyDate("未定（調整中）");
    expect(unparseable.parsedDate).toBeNull();
    expect(unparseable.dateString).toBeNull();
    expect(unparseable.rawString).toBe("未定（調整中）");
  });

  it("correctly identifies overdue tasks", () => {
    const referenceToday = "2026-11-04";
    expect(isOverdue("2026-11-03", referenceToday)).toBe(true);
    expect(isOverdue("2026-11-04", referenceToday)).toBe(false);
    expect(isOverdue("2026-11-05", referenceToday)).toBe(false);
  });

  it("correctly identifies due-this-week tasks", () => {
    const referenceToday = "2026-11-04";
    // 過去は false
    expect(isDueThisWeek("2026-11-03", referenceToday)).toBe(false);
    // 今日は true
    expect(isDueThisWeek("2026-11-04", referenceToday)).toBe(true);
    // 7日後は true (11/11)
    expect(isDueThisWeek("2026-11-11", referenceToday)).toBe(true);
    // 8日後は false (11/12)
    expect(isDueThisWeek("2026-11-12", referenceToday)).toBe(false);
  });

  it("determines time-of-day greeting key based on Asia/Tokyo hour", () => {
    // 08:00 JST (23:00 UTC previous day) -> morning
    const morningDate = new Date("2026-11-09T23:00:00Z"); // 08:00 JST
    expect(getGreetingKey(morningDate)).toBe("morning");

    // 14:00 JST (05:00 UTC) -> afternoon
    const afternoonDate = new Date("2026-11-09T05:00:00Z"); // 14:00 JST
    expect(getGreetingKey(afternoonDate)).toBe("afternoon");

    // 20:00 JST (11:00 UTC) -> evening
    const eveningDate = new Date("2026-11-09T11:00:00Z"); // 20:00 JST
    expect(getGreetingKey(eveningDate)).toBe("evening");

    // 03:00 JST (18:00 UTC previous day) -> evening (until 04:59)
    const lateNightDate = new Date("2026-11-09T18:00:00Z"); // 03:00 JST
    expect(getGreetingKey(lateNightDate)).toBe("evening");
  });
});

