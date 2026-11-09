"use client";

import React, { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * 画面切り替え中（ページ遷移・ルーティング）およびタブ切り替え時の最上部ピンク Linear Progress Indicator
 * - 画面遷移時（リンククリック・URL変更）
 * - タブ切り替え時（アプリ内 M3 Tabs の切り替え、およびブラウザタブ復帰時）
 * - 高さ 4px
 * - トラック背景: #FFD8E4
 * - 動くインジケーター: #E8467C
 * - prefers-reduced-motion: 静止した 4px バー
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [navigating, setNavigating] = useState(false);
  const [tabSwitching, setTabSwitching] = useState(false);

  // URL変化でナビゲーション完了
  useEffect(() => {
    setNavigating(false);
  }, [pathname, searchParams]);

  // aタグのクリック（画面遷移）および タブ切り替えクリック・ブラウザタブ復帰をグローバルに監視
  useEffect(() => {
    let tabTimer: NodeJS.Timeout | null = null;

    const triggerTabProgress = (durationMs = 450) => {
      if (tabTimer) clearTimeout(tabTimer);
      setTabSwitching(true);
      tabTimer = setTimeout(() => {
        setTabSwitching(false);
        tabTimer = null;
      }, durationMs);
    };

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target) return;

      // 1. リンククリック（画面遷移）
      const aTag = target.closest("a");
      if (aTag && aTag.href) {
        if (
          aTag.target !== "_blank" &&
          aTag.origin === window.location.origin &&
          aTag.href !== window.location.href
        ) {
          setNavigating(true);
          return;
        }
      }

      // 2. タブ切り替えクリック（role="tab", [data-tab], .m3-tab）
      const tabElem = target.closest('[role="tab"], [data-tab], .m3-tab');
      if (tabElem) {
        triggerTabProgress(450);
      }
    };

    // 3. ブラウザタブの切り替え復帰時（visibilitychange）
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        triggerTabProgress(500);
      }
    };

    // 4. カスタムイベント通知（プログラム的なタブ切り替え時）
    const handleCustomTabSwitch = () => {
      triggerTabProgress(450);
    };

    document.addEventListener("click", handleClick, { capture: true });
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("tab-switch", handleCustomTabSwitch);

    return () => {
      if (tabTimer) clearTimeout(tabTimer);
      document.removeEventListener("click", handleClick, { capture: true });
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("tab-switch", handleCustomTabSwitch);
    };
  }, []);

  const isActive = navigating || tabSwitching;

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

