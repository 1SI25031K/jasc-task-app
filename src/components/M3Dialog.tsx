"use client";

import React, { useEffect, useRef } from "react";
import { MaterialIcon } from "@/components/MaterialIcon";

interface M3DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxWidth?: string;
  ariaLabel?: string;
}

export function M3Dialog({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = "max-w-xl",
  ariaLabel,
}: M3DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isOpen]);

  const handleCancel = (e: React.SyntheticEvent) => {
    e.preventDefault();
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      onCancel={handleCancel}
      onClick={handleBackdropClick}
      aria-label={ariaLabel || title || "ダイアログ"}
      className="m3-dialog fixed inset-0 z-50 flex items-center justify-center p-4 m-auto"
    >
      <div
        className={`m3-dialog-surface w-full ${maxWidth} rounded-[28px] bg-surface-container-lowest p-6 shadow-2xl border-none outline-none text-on-surface max-h-[90vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between pb-3 border-b border-outline-variant/20 mb-4">
            <h2 className="text-lg font-medium text-on-surface">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="閉じる"
              className="flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high transition m3-interactive"
            >
              <MaterialIcon name="close" className="text-xl" />
            </button>
          </div>
        )}
        {children}
      </div>
    </dialog>
  );
}
