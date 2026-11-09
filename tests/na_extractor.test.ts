import { describe, it, expect } from "vitest";
import { maskPersonalInfo } from "@/lib/masking";
import {
  checkAndRecordRateLimit,
  RateLimitExceededError,
  buildExtractionContext,
  MinutesTooLongError,
  validateAndSanitizeCandidates,
  isCandidateReadyToSave,
} from "@/lib/gemini";
import { meetingToRow } from "@/lib/meetings-repo";
import { Meeting } from "@/lib/schemas/meetings";
import { Role, Member } from "@/lib/schemas";

describe("Batch 5: Personal Info Masking (5.7 / S12)", () => {
  it("masks email addresses and phone numbers but preserves dates", () => {
    const raw = `
      連絡先: test.user+jasc@example.co.jp または 090-1234-5678 まで。
      固定電話: (03) 1234-5678、国際番号: +81-90-9876-5432
      会議日程: 2026-11-09 に実施予定です。
    `;

    const masked = maskPersonalInfo(raw);
    expect(masked).toContain("連絡先: [メール] または [電話番号] まで。");
    expect(masked).toContain("固定電話: [電話番号]、国際番号: [電話番号]");
    expect(masked).toContain("会議日程: 2026-11-09 に実施予定です。");
  });
});

describe("Batch 5: Rate Limiting (S13)", () => {
  it("enforces max 3 calls per 60 seconds per user", () => {
    const testUser = "user_rate_limit_test";
    const now = 1000000;

    // 1st call: OK
    expect(() => checkAndRecordRateLimit(testUser, now)).not.toThrow();
    // 2nd call: OK
    expect(() => checkAndRecordRateLimit(testUser, now + 1000)).not.toThrow();
    // 3rd call: OK
    expect(() => checkAndRecordRateLimit(testUser, now + 2000)).not.toThrow();
    // 4th call within window: Throws RateLimitExceededError
    expect(() => checkAndRecordRateLimit(testUser, now + 3000)).toThrow(
      RateLimitExceededError
    );

    // Call after 60 seconds (window expired): OK
    expect(() =>
      checkAndRecordRateLimit(testUser, now + 65000)
    ).not.toThrow();
  });
});

describe("Batch 5: Extraction Context & Validation (S11 / S12)", () => {
  const mockRoles: Role[] = [
    { roleId: "r_prog", name: "プログラム", sortOrder: 1, active: true },
  ];
  const mockMembers: Member[] = [
    {
      memberId: "m_alice",
      displayName: "アリス",
      displayNameEn: "Alice",
      email: "secret_alice@example.com",
      mainRoles: "r_prog",
      lang: "ja",
      slackUserId: "U123",
      remindersEnabled: true,
      isAdmin: false,
      active: true,
      bgMode: "none",
      bgColor: "",
    },
  ];

  it("throws error if minutes length exceeds 20,000 characters", () => {
    const hugeText = "a".repeat(20001);
    expect(() =>
      buildExtractionContext(hugeText, "2026-11-09", mockRoles, mockMembers)
    ).toThrow(MinutesTooLongError);
  });

  it("strips email addresses from AI context members", () => {
    const context = buildExtractionContext(
      "議事メモ本文",
      "2026-11-09",
      mockRoles,
      mockMembers
    );
    expect(context.members).toEqual([["m_alice", "アリス"]]);
    expect(JSON.stringify(context)).not.toContain("secret_alice@example.com");
  });

  it("sanitizes AI outputs, stripping invalid member and role IDs", () => {
    const rawAiOutput = [
      {
        title: "A".repeat(150), // should truncate to 100
        next_action: "B".repeat(250), // should truncate to 200
        owner_member_id: "m_unknown_hacker", // should be cleared
        role_ids: ["r_prog", "r_invalid_role"], // should keep only r_prog
        na_due: "2026-11-20",
        weight: "重",
        evidence: "C".repeat(350), // should truncate to 300
      },
    ];

    const validMemberIds = new Set(["m_alice"]);
    const validRoleIds = new Set(["r_prog"]);

    const sanitized = validateAndSanitizeCandidates(
      rawAiOutput,
      validMemberIds,
      validRoleIds
    );

    expect(sanitized).toHaveLength(1);
    expect(sanitized[0].title).toHaveLength(100);
    expect(sanitized[0].nextAction).toHaveLength(200);
    expect(sanitized[0].evidence).toHaveLength(300);
    expect(sanitized[0].ownerMemberId).toBe(""); // cleared
    expect(sanitized[0].roleIds).toEqual(["r_prog"]);
    expect(sanitized[0].naDue).toBe("2026-11-20");
    expect(sanitized[0].weight).toBe("重");

    expect(isCandidateReadyToSave(sanitized[0])).toBe(false); // missing owner
  });
});

describe("Batch 5: Meetings Repo Serialization", () => {
  it("serializes Meeting to row array", () => {
    const meeting: Meeting = {
      meetingId: "mtg_abc123",
      meetingDate: "2026-11-09",
      title: "第5回 定例会",
      createdBy: "m_alice",
      createdAt: "2026-11-09T12:00:00Z",
      generatedCount: 5,
      savedCount: 3,
    };

    const row = meetingToRow(meeting);
    expect(row).toEqual([
      "mtg_abc123",
      "2026-11-09",
      "第5回 定例会",
      "m_alice",
      "2026-11-09T12:00:00Z",
      "5",
      "3",
    ]);
  });
});
