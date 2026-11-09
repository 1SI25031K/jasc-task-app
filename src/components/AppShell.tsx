"use client";

import React, { useState } from "react";
import { TopBar } from "@/components/TopBar";
import { NavigationDrawer } from "@/components/NavigationDrawer";
import { Fab } from "@/components/Fab";
import { TaskCreateModal } from "@/components/TaskModals";
import { useDashboard } from "@/context/DashboardContext";
import { MaterialIcon } from "@/components/MaterialIcon";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const { data, currentMember, refresh } = useDashboard();

  return (
    <div className="flex min-h-screen flex-col bg-[#F8F9FA]">
      <TopBar onMenuClick={() => setMobileDrawerOpen(true)} />

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
        <footer className="border-t border-[#C4C7C5]/40 bg-[#F9DEDC]/40 px-4 py-3 text-xs text-[#410E0B]">
          <div className="mx-auto max-w-[960px] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MaterialIcon name="error_outline" className="text-base text-[#B3261E] shrink-0" />
              <span>
                <strong>データ通知:</strong> {data.invalidRows.length} 行を読み込めませんでした（該当行以外は正常に表示されています）。
              </span>
            </div>
            <details className="cursor-pointer">
              <summary className="font-medium text-[#B3261E] hover:underline">詳細を表示</summary>
              <div className="mt-2 max-h-40 overflow-y-auto space-y-1 rounded-[8px] bg-white p-2 border border-[#C4C7C5]/40">
                {data.invalidRows.map((inv, idx) => (
                  <div key={idx} className="font-mono text-[11px] text-[#444746]">
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

