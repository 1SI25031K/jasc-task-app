import React from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { fetchDashboardData } from "@/lib/data";
import { verifyMemberAccess } from "@/lib/auth-helpers";
import { DashboardProvider } from "@/context/DashboardContext";
import { SnackbarProvider } from "@/context/SnackbarContext";
import { AppShell } from "@/components/AppShell";
import { MaterialIcon } from "@/components/MaterialIcon";

export const revalidate = 300; // 5分キャッシュ

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const userEmail = session?.user?.email || "";

  let dashboardData;
  try {
    dashboardData = await fetchDashboardData();
  } catch (err: any) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-surface">
        <div className="max-w-md rounded-m3-xl bg-surface-container-lowest p-6 text-center text-on-surface shadow-sm">
          <MaterialIcon name="error_outline" size={40} className="mx-auto text-error mb-2" />
          <h2 className="font-medium text-lg">データの読み込みに失敗しました</h2>
          <p className="mt-2 text-sm text-on-surface-variant">{err?.message || "Google Sheets API エラー"}</p>
        </div>
      </div>
    );
  }

  // ログインユーザーが members シートで active=true か検証（S1 認証ゲート）
  if (process.env.DEV_BYPASS_AUTH !== "true") {
    const authResult = verifyMemberAccess(
      !!session?.user,
      userEmail,
      dashboardData.members
    );
    if (authResult.status !== "authorized") {
      redirect("/unauthorized");
    }
  }

  return (
    <DashboardProvider initialData={dashboardData} userEmail={userEmail}>
      <SnackbarProvider>
        <AppShell>{children}</AppShell>
      </SnackbarProvider>
    </DashboardProvider>
  );
}
