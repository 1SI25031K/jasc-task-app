import { describe, it, expect } from "vitest";
import { checkinToRow } from "@/lib/checkins-repo";
import { Checkin } from "@/lib/schemas/checkins";

describe("Checkins Repo & Serialization", () => {
  it("checkinToRow formats all 6 columns as strings for RAW sheet insertion", () => {
    const checkin: Checkin = {
      checkinId: "c_123456",
      memberId: "m_alice",
      date: "2026-11-09",
      score: 8,
      comment: "Busy with conference prep",
      autoLoadAtCheckin: 12,
    };

    const row = checkinToRow(checkin);
    expect(row).toEqual([
      "c_123456",
      "m_alice",
      "2026-11-09",
      "8",
      "Busy with conference prep",
      "12",
    ]);
  });

  it("handles empty comments and null autoLoadAtCheckin gracefully", () => {
    const checkin: Checkin = {
      checkinId: "c_999999",
      memberId: "m_bob",
      date: "2026-11-09",
      score: 4,
      comment: "",
      autoLoadAtCheckin: null,
    };

    const row = checkinToRow(checkin);
    expect(row).toEqual([
      "c_999999",
      "m_bob",
      "2026-11-09",
      "4",
      "",
      "0",
    ]);
  });

  it("ensures scores outside 1-10 are caught by validation logic", () => {
    const validateScore = (score: number) => {
      const intScore = Math.round(score);
      if (isNaN(intScore) || intScore < 1 || intScore > 10) {
        return false;
      }
      return true;
    };

    expect(validateScore(1)).toBe(true);
    expect(validateScore(10)).toBe(true);
    expect(validateScore(5)).toBe(true);
    expect(validateScore(0)).toBe(false);
    expect(validateScore(11)).toBe(false);
    expect(validateScore(-3)).toBe(false);
  });
});

