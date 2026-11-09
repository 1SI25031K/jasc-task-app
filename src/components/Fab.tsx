"use client";

import React, { useState, useEffect } from "react";
import { MaterialIcon } from "@/components/MaterialIcon";

interface FabProps {
  onClick: () => void;
  label?: string;
  ariaLabel?: string;
}

export function Fab({ onClick, label = "作成", ariaLabel = "新規タスクを作成" }: FabProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    let lastScrollY = window.scrollY;
    let ticking = false;

    const updateScrollDir = () => {
      const scrollY = window.scrollY;

      if (scrollY <= 20) {
        setIsExpanded(true);
      } else if (scrollY > lastScrollY + 8) {
        // 8px 以上下スクロールでアイコンのみに縮小
        setIsExpanded(false);
      } else if (scrollY < lastScrollY - 8) {
        // 8px 以上上スクロールで再展開
        setIsExpanded(true);
      }

      lastScrollY = Math.max(0, scrollY);
      ticking = false;
    };

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(updateScrollDir);
        ticking = true;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`fixed bottom-6 right-6 z-40 flex h-14 items-center justify-center rounded-[16px] bg-primary-container text-on-primary-container shadow-md hover:shadow-lg active:shadow-sm transition-all duration-medium2 ease-emphasized gap-2 m3-interactive group ${
        isExpanded && label ? "px-4 min-w-[56px]" : "w-14 p-0"
      }`}
    >
      <MaterialIcon name="add" className="text-2xl text-on-primary-container shrink-0" />
      {label && (
        <span
          className={`overflow-hidden whitespace-nowrap text-sm font-medium transition-[max-width,opacity] duration-medium2 ease-emphasized ${
            isExpanded ? "max-w-[120px] opacity-100 pr-1" : "max-w-0 opacity-0"
          }`}
        >
          {label}
        </span>
      )}
    </button>
  );
}
