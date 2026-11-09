import { describe, it, expect, vi } from "vitest";
import { memberToRow } from "@/lib/members-repo";
import { Member } from "@/lib/schemas";
import { verifyMemberAccess } from "@/lib/auth-helpers";

describe("Batch 1: Write Foundation & Member Settings", () => {
  const activeMember: Member = {
    memberId: "m001",
    displayName: "テスト太郎",
    displayNameEn: "Taro Test",
    email: "taro@example.com",
    mainRoles: "r_chair",
    lang: "ja",
    slackUserId: "U001",
    remindersEnabled: true,
    isAdmin: true,
    active: true,
    bgMode: "standard",
    bgColor: "standard",
  };

  const inactiveMember: Member = {
    ...activeMember,
    memberId: "m002",
    email: "inactive@example.com",
    active: false,
  };

  it("serializes Member to sheet row correctly (S5 / RAW)", () => {
    const row = memberToRow(activeMember);
    expect(row).toEqual([
      "m001",
      "テスト太郎",
      "Taro Test",
      "taro@example.com",
      "r_chair",
      "ja",
      "U001",
      "TRUE",
      "TRUE",
      "TRUE",
      "standard",
      "standard",
    ]);
  });

  it("verifies active member authorization (S1)", () => {
    const resActive = verifyMemberAccess(true, "taro@example.com", [activeMember, inactiveMember]);
    expect(resActive.status).toBe("authorized");
    expect(resActive.member?.memberId).toBe("m001");

    const resInactive = verifyMemberAccess(true, "inactive@example.com", [activeMember, inactiveMember]);
    expect(resInactive.status).toBe("unauthorized");

    const resUnknown = verifyMemberAccess(true, "unknown@example.com", [activeMember]);
    expect(resUnknown.status).toBe("unauthorized");

    const resNoLogin = verifyMemberAccess(false, "taro@example.com", [activeMember]);
    expect(resNoLogin.status).toBe("unauthenticated");
  });
});

