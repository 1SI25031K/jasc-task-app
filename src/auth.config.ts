import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Edge ランタイム互換の Auth.js 設定。
 * middleware.ts から参照され、Node.js 固有の API に依存しない設定のみを記述します。
 */
export const authConfig: NextAuthConfig = {
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  ],
  pages: {
    signIn: "/login",
    error: "/unauthorized",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;

      // /api/revalidate へのアクセス: REVALIDATE_TOKEN ヘッダーまたはログイン状態を許可
      if (nextUrl.pathname.startsWith("/api/revalidate")) {
        return true;
      }

      // 開発時・ローカル検証時のバイパスモード
      if (process.env.DEV_BYPASS_AUTH === "true") {
        return true;
      }

      // 公開ルート（ログイン画面、未認証画面）
      const isPublic =
        nextUrl.pathname.startsWith("/login") ||
        nextUrl.pathname.startsWith("/unauthorized");
      if (isPublic) {
        return true;
      }

      // 未ログインはログイン画面へリダイレクト
      return isLoggedIn;
    },
  },
};
