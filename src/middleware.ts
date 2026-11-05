import { NextResponse } from "next/server";
import { auth } from "@/auth";

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;
  const email = req.auth?.user?.email?.toLowerCase().trim();

  // /api/revalidate へのアクセス: 認証セッションまたは REVALIDATE_TOKEN ヘッダーで許可
  if (nextUrl.pathname.startsWith("/api/revalidate")) {
    const authHeader = req.headers.get("authorization") || req.headers.get("x-revalidate-token");
    const secret = process.env.REVALIDATE_TOKEN;
    if (secret && authHeader && (authHeader === secret || authHeader === `Bearer ${secret}`)) {
      return NextResponse.next();
    }
    if (!isLoggedIn) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // 開発時・ローカル検証時のバイパスモード
  if (process.env.DEV_BYPASS_AUTH === "true") {
    return NextResponse.next();
  }

  // 公開ルート（ログイン画面、未認証画面）
  const isPublic = nextUrl.pathname.startsWith("/login") || nextUrl.pathname.startsWith("/unauthorized");
  if (isPublic) {
    return NextResponse.next();
  }

  // 未ログイン時はログイン画面へリダイレクト
  if (!isLoggedIn) {
    const loginUrl = new URL("/login", nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 許可リストチェック
  const allowedList = (process.env.ALLOWED_EMAILS || "")
    .split(",")
    .map((e) => e.toLowerCase().trim())
    .filter(Boolean);

  if (allowedList.length > 0 && email && !allowedList.includes(email)) {
    return NextResponse.redirect(new URL("/unauthorized", nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};

