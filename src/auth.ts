import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      const email = user.email?.toLowerCase().trim();
      if (!email) return false;

      const allowedList = (process.env.ALLOWED_EMAILS || "")
        .split(",")
        .map((e) => e.toLowerCase().trim())
        .filter(Boolean);

      // 環境変数に指定がある場合はチェック（指定が空なら名簿参照等は後段または全許可）
      if (allowedList.length > 0 && !allowedList.includes(email)) {
        return false;
      }
      return true;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/unauthorized",
  },
});

