import { auth } from "@/auth";
import { fetchDashboardData, DashboardData } from "./data";
import { Member } from "./schemas";
import { verifyMemberAccess } from "./auth-helpers";

export interface ActiveMemberContext {
  member: Member;
  sessionEmail: string;
  data: DashboardData;
}

/**
 * サーバー側で認証および members シートでの active=TRUE を厳格に確認する（S1）。
 * 未ログインまたは非 active メンバーの場合は Error を投げる。
 */
export async function requireActiveMember(): Promise<ActiveMemberContext> {
  const isDevBypass = process.env.DEV_BYPASS_AUTH === "true";
  const data = await fetchDashboardData();

  if (isDevBypass) {
    const activeMember = data.members.find((m) => m.active) || data.members[0];
    if (!activeMember) {
      throw new Error("No active members found in sheet");
    }
    return {
      member: activeMember,
      sessionEmail: activeMember.email,
      data,
    };
  }

  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) {
    throw new Error("UNAUTHENTICATED: ログインが必要です。");
  }

  const result = verifyMemberAccess(true, email, data.members);
  if (result.status !== "authorized" || !result.member) {
    throw new Error("FORBIDDEN: アクセス権限がありません（有効なメンバーのみ利用可能です）。");
  }

  return {
    member: result.member,
    sessionEmail: email,
    data,
  };
}
