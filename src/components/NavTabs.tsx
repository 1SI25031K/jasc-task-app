"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDashboard } from "@/context/DashboardContext";
import {
  Home,
  LayoutGrid,
  CheckSquare,
  AlertTriangle,
  ListTodo,
  Activity,
  BarChart3,
  Smile,
  Inbox,
} from "lucide-react";
import { getOverdueTasks } from "@/lib/services";

export function NavTabs() {
  const pathname = usePathname();
  const { data, currentMember, t } = useDashboard();

  // バッジ集計
  const overdueCount = getOverdueTasks(data.tasks).length;
  const inboxCount = data.tasks.filter(
    (t) =>
      !t.archived &&
      t.status !== "完了" &&
      t.ownerMemberId === currentMember.memberId &&
      ["依頼中", "相談中"].includes(t.assignmentStatus) &&
      t.requestedBy !== currentMember.memberId
  ).length;

  const navItems = [
    { href: "/", label: t("nav.home"), icon: Home },
    { href: "/board", label: t("nav.board"), icon: LayoutGrid },
    { href: "/my-tasks", label: t("nav.my_tasks"), icon: CheckSquare },
    {
      href: "/alerts",
      label: t("nav.alerts"),
      icon: AlertTriangle,
      badge: overdueCount > 0 ? overdueCount : undefined,
      badgeColor: "bg-red-500 text-white",
    },
    { href: "/all-tasks", label: t("nav.all_tasks"), icon: ListTodo },
    { href: "/capacity", label: t("nav.capacity_map"), icon: Activity },
    { href: "/progress", label: t("nav.progress"), icon: BarChart3 },
    { href: "/checkin", label: t("nav.checkin"), icon: Smile },
    {
      href: "/inbox",
      label: t("nav.inbox"),
      icon: Inbox,
      badge: inboxCount > 0 ? inboxCount : undefined,
      badgeColor: "bg-amber-500 text-white",
    },
  ];

  return (
    <div className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <nav className="flex space-x-1 sm:space-x-2 overflow-x-auto py-2 no-scrollbar">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition shrink-0 ${
                  isActive
                    ? "bg-blue-50 text-blue-700 shadow-sm"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? "text-blue-600" : "text-slate-400"}`} />
                <span>{item.label}</span>
                {item.badge !== undefined && (
                  <span
                    className={`ml-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold ${item.badgeColor}`}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

