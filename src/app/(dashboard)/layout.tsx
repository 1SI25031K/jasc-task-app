import React from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { fetchDashboardData } from "@/lib/data";
import { verifyMemberAccess } from "@/lib/auth-helpers";
import { DashboardProvider } from "@/context/DashboardContext";
import { TopBar } from "@/components/TopBar";
import { NavTabs } from "@/components/NavTabs";
import { AlertCircle } from "lucide-react";

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
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="max-w-md rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-800">
          <AlertCircle className="mx-auto h-10 w-10 text-red-600 mb-2" />
          <h2 className="font-bold text-lg">データの読み込みに失敗しました</h2>
          <p className="mt-2 text-sm text-red-700">{err?.message || "Google Sheets API エラー"}</p>
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
      <div className="flex min-h-screen flex-col bg-slate-50">
        <TopBar />
        <NavTabs />

        <main className="flex-1 pb-16">{children}</main>

        {/* 壊れた行・検証エラーのフェイルセーフ表示（要件定義書 5.2 準拠） */}
        {dashboardData.invalidRows.length > 0 && (
          <footer className="border-t border-amber-200 bg-amber-50/80 px-4 py-3 text-xs text-amber-800">
            <div className="mx-auto max-w-7xl flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                <span>
                  <strong>データ通知:</strong> {dashboardData.invalidRows.length} 行を読み込めませんでした（該当行以外は正常に表示されています）。
                </span>
              </div>
              <details className="cursor-pointer">
                <summary className="font-medium text-amber-700 hover:underline">詳細を表示</summary>
                <div className="mt-2 max-h-40 overflow-y-auto space-y-1 rounded bg-white p-2 border border-amber-200">
                  {dashboardData.invalidRows.map((inv, idx) => (
                    <div key={idx} className="font-mono text-[11px] text-slate-700">
                      [{inv.sheetName}] 行 {inv.rowIndex}: {inv.reason}
                    </div>
                  ))}
                </div>
              </details>
            </div>
          </footer>
        )}
      </div>
    </DashboardProvider>
  );
}
