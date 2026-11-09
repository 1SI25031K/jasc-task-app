"use client";

import React, { useState, useEffect } from "react";
import { TopBar, BG_PALETTES } from "@/components/TopBar";
import { NavigationDrawer } from "@/components/NavigationDrawer";
import { Fab } from "@/components/Fab";
import { TaskCreateModal } from "@/components/TaskModals";
import { useDashboard } from "@/context/DashboardContext";
import { MaterialIcon } from "@/components/MaterialIcon";
import { NavigationProgress } from "@/components/NavigationProgress";
import { BingWallpaperInfo } from "@/lib/bing";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [bingWallpaper, setBingWallpaper] = useState<BingWallpaperInfo | null>(null);
  const { data, currentMember, refresh } = useDashboard();

  // Bing 今日の景色が選択されている場合に壁紙情報をフェッチ
  useEffect(() => {
    if (currentMember.bgMode === "bing") {
      fetch("/api/bing-wallpaper")
        .then((res) => res.json())
        .then((resData) => {
          if (resData?.wallpaper) {
            setBingWallpaper(resData.wallpaper);
          }
        })
        .catch(() => setBingWallpaper(null));
    } else {
      setBingWallpaper(null);
    }
  }, [currentMember.bgMode]);

  // 背景スタイル計算（7.7仕様移植）
  const isBing = currentMember.bgMode === "bing" && bingWallpaper !== null;
  const activeColorKey = currentMember.bgColor || "standard";
  const hexColor = BG_PALETTES[activeColorKey]?.hex || "#F0F4F9";

  const appBackgroundStyle: React.CSSProperties = isBing
    ? {
        backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.15), rgba(0, 0, 0, 0.15)), url('${bingWallpaper?.imageUrl}')`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center center",
        backgroundAttachment: "fixed",
        backgroundSize: "cover",
      }
    : {
        backgroundColor: hexColor,
      };

  return (
    <div className="flex min-h-screen flex-col transition-colors duration-300" style={appBackgroundStyle}>
      {/* 最上部ピンク Linear Progress Indicator */}
      <NavigationProgress />

      <TopBar
        onMenuClick={() => setMobileDrawerOpen(true)}
        bingWallpaper={bingWallpaper}
      />

      <div className="flex flex-1 w-full">
        <NavigationDrawer
          mobileOpen={mobileDrawerOpen}
          onMobileClose={() => setMobileDrawerOpen(false)}
        />

        <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-6 pb-24">
          <div className="mx-auto max-w-[960px] w-full">
            {children}
          </div>
        </main>
      </div>

      {/* Bing 壁紙の著作権表示（画面左下・7.7仕様準拠） */}
      {isBing && bingWallpaper?.copyright && (
        <div className="fixed bottom-2 left-4 z-30 max-w-sm rounded-[8px] bg-black/40 backdrop-blur-xs px-2.5 py-1 text-[10px] text-white/90 select-none pointer-events-none">
          © {bingWallpaper.copyright}
        </div>
      )}

      {/* M3 Floating Action Button (タスク作成) */}
      <Fab
        onClick={() => setCreateModalOpen(true)}
        label="作成"
        ariaLabel="新規タスクを作成"
      />

      {/* タスク作成モーダル */}
      <TaskCreateModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        members={data.members}
        roles={data.roles}
        tasks={data.tasks}
        checkins={data.checkins}
        currentMemberId={currentMember.memberId}
        onSuccess={refresh}
      />

      {/* 壊れた行・検証エラーのフェイルセーフ表示 */}
      {data.invalidRows.length > 0 && (
        <footer className="border-t border-error/30 bg-error-container/60 px-4 py-3 text-xs text-on-error-container">
          <div className="mx-auto max-w-[960px] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MaterialIcon name="error_outline" size={18} className="text-error shrink-0" />
              <span>
                <strong>データ通知:</strong> {data.invalidRows.length} 行を読み込めませんでした（該当行以外は正常に表示されています）。
              </span>
            </div>
            <details className="cursor-pointer">
              <summary className="font-medium text-error hover:underline">詳細を表示</summary>
              <div className="mt-2 max-h-40 overflow-y-auto space-y-1 rounded-[8px] bg-surface-container-lowest p-2 border border-outline-variant/40">
                {data.invalidRows.map((inv, idx) => (
                  <div key={idx} className="font-mono text-[11px] text-on-surface-variant">
                    [{inv.sheetName}] 行 {inv.rowIndex}: {inv.reason}
                  </div>
                ))}
              </div>
            </details>
          </div>
        </footer>
      )}
    </div>
  );
}
