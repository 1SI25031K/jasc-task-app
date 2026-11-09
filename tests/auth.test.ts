import { describe, it, expect } from "vitest";
import { verifyMemberAccess } from "@/lib/auth-helpers";
import { Member } from "@/lib/schemas";

describe("verifyMemberAccess (F1 / S1)", () => {
  const mockMembers: Member[] = [
    {
      memberId: "m001",
      displayName: "メンバーA",
      displayNameEn: "Member A",
      email: "Member_A@Example.com",
      slackUserId: "U001",
      lang: "ja",
      remindersEnabled: true,
      active: true,
      displayOrder: 1,
    },
    {
      memberId: "m009",
      displayName: "休止メンバー",
      displayNameEn: "Inactive Member",
      email: "inactive@example.com",
      slackUserId: "U009",
      lang: "en",
      remindersEnabled: false,
      active: false,
      displayOrder: 9,
    },
  ];

  it("authorizes active member with case-insensitivity and whitespace trimming", () => {
    const res = verifyMemberAccess(true, "  MEMBER_A@example.com ", mockMembers);
    expect(res.status).toBe("authorized");
    expect(res.member).not.toBeNull();
    expect(res.member?.memberId).toBe("m001");
    expect(res.email).toBe("member_a@example.com");
  });

  it("denies access to unregistered emails", () => {
    const res = verifyMemberAccess(true, "stranger@example.com", mockMembers);
    expect(res.status).toBe("unauthorized");
    expect(res.member).toBeNull();
    expect(res.email).toBe("stranger@example.com");
  });

  it("denies access to inactive members (active=false)", () => {
    const res = verifyMemberAccess(true, "INACTIVE@example.com", mockMembers);
    expect(res.status).toBe("unauthorized");
    expect(res.member).toBeNull();
  });

  it("returns unauthenticated for not logged in or empty email", () => {
    const res1 = verifyMemberAccess(false, "member_a@example.com", mockMembers);
    expect(res1.status).toBe("unauthenticated");
    expect(res1.member).toBeNull();

    const res2 = verifyMemberAccess(true, "", mockMembers);
    expect(res2.status).toBe("unauthenticated");

    const res3 = verifyMemberAccess(true, "   ", mockMembers);
    expect(res3.status).toBe("unauthenticated");
  });
});

