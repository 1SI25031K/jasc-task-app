"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { MaterialIcon } from "@/components/MaterialIcon";

export interface SnackbarAction {
  label: string;
  onClick: () => void;
}

export interface SnackbarOptions {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  action?: SnackbarAction;
  duration?: number; // ms
}

interface SnackbarContextType {
  showSnackbar: (options: SnackbarOptions) => void;
}

const SnackbarContext = createContext<SnackbarContextType | null>(null);

export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<SnackbarOptions | null>(null);
  const [visible, setVisible] = useState(false);

  const showSnackbar = useCallback((options: SnackbarOptions) => {
    setCurrent(options);
    setVisible(true);
  }, []);

  const actionLabel = current?.action?.label || current?.actionLabel;
  const onAction = current?.action?.onClick || current?.onAction;

  useEffect(() => {
    if (!current || !visible) return;
    const defaultDuration = actionLabel ? 8000 : 4000;
    const duration = current.duration ?? defaultDuration;

    const timer = setTimeout(() => {
      setVisible(false);
    }, duration);

    return () => clearTimeout(timer);
  }, [current, visible, actionLabel]);

  return (
    <SnackbarContext.Provider value={{ showSnackbar }}>
      {children}
      {current && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center justify-between gap-4 min-w-[288px] max-w-[560px] min-h-[48px] px-4 py-3 rounded-m3-xs bg-inverse-surface text-inverse-on-surface shadow-lg transition-all duration-250 ${
            visible
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-2 pointer-events-none"
          }`}
        >
          <span className="text-sm font-normal select-none">{current.message}</span>
          {actionLabel && onAction && (
            <button
              onClick={() => {
                onAction();
                setVisible(false);
              }}
              className="m3-interactive ml-auto px-2 py-1 text-sm font-medium text-inverse-primary rounded-full hover:bg-white/8 transition"
            >
              {actionLabel}
            </button>
          )}
        </div>
      )}
    </SnackbarContext.Provider>
  );
}

export function useSnackbar() {
  const ctx = useContext(SnackbarContext);
  if (!ctx) {
    throw new Error("useSnackbar must be used within SnackbarProvider");
  }
  return ctx;
}
