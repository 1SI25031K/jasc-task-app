"use client";

import React from "react";
import { MaterialIcon } from "@/components/MaterialIcon";

interface FabProps {
  onClick: () => void;
  label?: string;
  ariaLabel?: string;
}

export function Fab({ onClick, label, ariaLabel = "タスクを作成" }: FabProps) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      className="fixed bottom-6 right-6 z-40 flex h-14 items-center justify-center rounded-[16px] bg-[#D3E3FD] text-[#041E49] shadow-md hover:shadow-lg hover:brightness-95 active:shadow-sm active:brightness-90 transition-all duration-200 gap-2 px-4 group focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B57D0]"
    >
      <MaterialIcon name="add" className="text-2xl text-[#041E49]" />
      {label && (
        <span className="text-sm font-medium text-[#041E49] pr-1">
          {label}
        </span>
      )}
    </button>
  );
}

