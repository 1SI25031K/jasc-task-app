"use client";

import React, { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useDashboard } from "@/context/DashboardContext";

/**
 * 画面切り替え中・リフレッシュ実行中の最上部ピンク Linear Progress Indicator（フェーズ 7.7 移植）
 * - 高さ 4px
 * - トラック背景: #FFD8E4
 * - 動くインジケーター: #E8467C
 * - prefers-reduced-motion: 静止した 4px バー
 */
export function NavigationProgress() {
  const { isRefreshing } = useDashboard();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [navigating, setNavigating] = useState(false);

  // URL変化でナビゲーション完了
  useEffect(() => {
    setNavigating(false);
  }, [pathname, searchParams]);

  // aタグのクリックをグローバルに監視してプログレスバーを即座に開始
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("a");
      if (!target || !target.href) return;
      // 外部リンクや target="_blank" は除外
      if (target.target === "_blank" || target.origin !== window.location.origin) return;
      if (target.href === window.location.href) return;
      setNavigating(true);
    };

    document.addEventListener("click", handleClick, { capture: true });
    return () => document.removeEventListener("click", handleClick, { capture: true });
  }, []);

  const isActive = navigating || isRefreshing;

  if (!isActive) return null;

  return (
    <div
      role="progressbar"
      aria-label="読み込み中"
      className="fixed top-0 left-0 right-0 h-1 z-[99999] overflow-hidden bg-[#FFD8E4]"
    >
      <div className="m3-linear-indeterminate h-full bg-[#E8467C]" />
      <style jsx>{`
        .m3-linear-indeterminate {
          position: absolute;
          top: 0;
          bottom: 0;
          animation: m3-linear-progress-indeterminate 2.1s cubic-bezier(0.65, 0.815, 0.735, 0.395) infinite;
        }

        @keyframes m3-linear-progress-indeterminate {
          0% {
            left: -35%;
            right: 100%;
            width: 35%;
          }
          60% {
            left: 100%;
            right: -90%;
            width: 90%;
          }
          100% {
            left: 100%;
            right: -90%;
            width: 90%;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .m3-linear-indeterminate {
            animation: none !important;
            left: 0 !important;
            width: 100% !important;
          }
        }
      `}</style>
    </div>
  );
}
