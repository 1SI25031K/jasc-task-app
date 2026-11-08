import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { fetchDashboardData } from "./lib/data";
import { verifyMemberAccess } from "./lib/auth-helpers";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user }) {
      const email = user.email;
      if (!email) return false;

      try {
        const data = await fetchDashboardData();
        const authResult = verifyMemberAccess(true, email, data.members);
        if (authResult.status !== "authorized") {
          console.warn(`[auth] Access denied for email: ${email} (status: ${authResult.status})`);
          return false;
        }
        return true;
      } catch (err) {
        console.error("[auth] Failed to verify member access against Google Sheets:", err);
        return false;
      }
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
});
