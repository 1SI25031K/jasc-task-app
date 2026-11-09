"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDashboard } from "@/context/DashboardContext";
import { MaterialIcon } from "./MaterialIcon";
import { getOverdueTasks } from "@/lib/services";

interface NavigationDrawerProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

// 6色のトナルパレット（交代で円形背景に適用）
const TONAL_PALETTE = [
  { bg: "#D3E3FD", icon: "#0B57D0" }, // 1. 青 (Blue)
  { bg: "#E9DDFF", icon: "#6B4FBB" }, // 2. 紫 (Purple)
  { bg: "#C4EED0", icon: "#146C2E" }, // 3. 緑 (Green)
  { bg: "#FFDCC1", icon: "#8B4A00" }, // 4. 橙 (Orange)
  { bg: "#FFD8E4", icon: "#9C2A5C" }, // 5. 桃 (Pink)
  { bg: "#BDEBEA", icon: "#00696B" }, // 6. 青緑 (Teal)
];

export function NavigationDrawer({ mobileOpen, onMobileClose }: NavigationDrawerProps) {
  const pathname = usePathname();
  const { data, currentMember, t } = useDashboard();

  // バッジ集計
  const overdueCount = getOverdueTasks(data.tasks).length;
  const inboxCount = data.tasks.filter(
    (task) =>
      !task.archived &&
      task.status !== "完了" &&
      task.ownerMemberId === currentMember.memberId &&
      ["依頼中", "相談中"].includes(task.assignmentStatus) &&
      task.requestedBy !== currentMember.memberId
  ).length;

  const navItems = [
    { href: "/", label: t("nav.home"), icon: "home" },
    { href: "/board", label: t("nav.board"), icon: "grid_view" },
    { href: "/my-tasks", label: t("nav.my_tasks"), icon: "check_circle" },
    {
      href: "/inbox",
      label: t("nav.inbox"),
      icon: "inbox",
      badge: inboxCount > 0 ? inboxCount : undefined,
      badgeColor: "bg-primary text-on-primary",
    },
    {
      href: "/alerts",
      label: t("nav.alerts"),
      icon: "warning",
      badge: overdueCount > 0 ? overdueCount : undefined,
      badgeColor: "bg-error-container text-on-error-container font-semibold", // M3 error-container
    },
    { href: "/all-tasks", label: t("nav.all_tasks"), icon: "format_list_bulleted" },
    { href: "/capacity", label: t("nav.capacity_map"), icon: "speed" },
    { href: "/checkin", label: t("nav.checkin"), icon: "mood" },
    { href: "/minutes", label: t("nav.minutes"), icon: "auto_awesome" },
    { href: "/progress", label: t("nav.progress"), icon: "bar_chart" },
  ];

  const renderNavList = (isRail = false) => (
    <nav className="flex flex-col gap-1 px-3 py-3 w-full">
      {navItems.map((item, index) => {
        const isActive =
          item.href === "/"
            ? pathname === "/"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);

        const tonal = TONAL_PALETTE[index % TONAL_PALETTE.length];

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onMobileClose}
            className={`m3-interactive group relative flex items-center rounded-full select-none overflow-hidden ${
              isRail
                ? "flex-col justify-center py-2 px-1 text-center h-[64px]"
                : "h-[56px] px-4 gap-3"
            } ${
              isActive
                ? "text-on-primary-container font-medium"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {/* Active Indicator: 中央から横に広がる M3 アニメーション */}
            <span
              className={`absolute inset-0 rounded-full bg-primary-container pointer-events-none transition-transform duration-300 ease-[cubic-bezier(0.05,0.7,0.1,1)] ${
                isActive ? "scale-x-100 opacity-100" : "scale-x-0 opacity-0"
              }`}
              style={{ transformOrigin: "center" }}
              aria-hidden="true"
            />

            {/* アイコン（28px 円形） */}
            <div
              className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-200 shrink-0 ${
                isActive ? "bg-primary text-on-primary" : ""
              }`}
              style={
                !isActive
                  ? { backgroundColor: tonal.bg, color: tonal.icon }
                  : undefined
              }
            >
              <MaterialIcon
                name={item.icon}
                filled={isActive}
                size={20}
              />
            </div>

            {/* ラベル */}
            <span
              className={`relative z-10 truncate text-sm ${
                isRail ? "text-[11px] mt-1 font-normal" : "flex-1"
              }`}
            >
              {item.label}
            </span>

            {/* バッジ */}
            {item.badge !== undefined && (
              <span
                className={`relative z-10 flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-xs font-semibold ${item.badgeColor} ${
                  isRail ? "absolute top-1 right-2" : "ml-auto"
                }`}
              >
                {item.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* 1. PC: Permanent Navigation Drawer (>= 1240px: 280px, surface 背景、境界線・影なし) */}
      <aside className="hidden xl:flex w-[280px] shrink-0 flex-col bg-surface">
        <div className="sticky top-16 h-[calc(100vh-64px)] overflow-y-auto">
          {renderNavList(false)}
        </div>
      </aside>

      {/* 2. Tablet: Navigation Rail (840px - 1239px: 80px, surface 背景、境界線・影なし) */}
      <aside className="hidden md:flex xl:hidden w-[80px] shrink-0 flex-col bg-surface items-center">
        <div className="sticky top-16 h-[calc(100vh-64px)] overflow-y-auto w-full">
          {renderNavList(true)}
        </div>
      </aside>

      {/* 3. Mobile: Modal Navigation Drawer (< 840px) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          {/* Scrim */}
          <div
            className="fixed inset-0 bg-scrim/32 transition-opacity"
            onClick={onMobileClose}
            aria-hidden="true"
          />

          {/* Drawer container */}
          <div className="relative flex w-[280px] max-w-[80vw] flex-col bg-surface-container-low shadow-xl">
            <div className="flex h-16 items-center px-4">
              <span className="text-base font-medium text-on-surface">
                {t("app.title")}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              {renderNavList(false)}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
