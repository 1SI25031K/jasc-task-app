import { Member } from "./schemas";

export type AuthStatus = "unauthenticated" | "unauthorized" | "authorized";

export interface VerifyMemberResult {
  status: AuthStatus;
  member: Member | null;
  email: string;
}

/**
 * ログイン状態とメールアドレスを受け取り、active なメンバー名簿と照合する（F1 / S1）。
 * Streamlit 版 core/auth.py の verify_member_access と完全互換。
 *
 * - メールアドレスは前後の空白を除き、小文字（lowercase）に統一して比較する。
 * - 未ログイン・空メールは unauthenticated を返す。
 * - 名簿に存在しない、または active=false の場合は unauthorized を返す。
 * - 一致する active=true のメンバーがいれば authorized とその Member を返す。
 */
export function verifyMemberAccess(
  isLoggedIn: boolean,
  email: string | null | undefined,
  members: Iterable<Member>
): VerifyMemberResult {
  if (!isLoggedIn || !email || !email.trim()) {
    return { status: "unauthenticated", member: null, email: "" };
  }

  const normalizedEmail = email.trim().toLowerCase();
  for (const m of members) {
    if (m.email.trim().toLowerCase() === normalizedEmail) {
      if (m.active) {
        return {
          status: "authorized",
          member: m,
          email: normalizedEmail,
        };
      }
      return {
        status: "unauthorized",
        member: null,
        email: normalizedEmail,
      };
    }
  }

  return {
    status: "unauthorized",
    member: null,
    email: normalizedEmail,
  };
}

