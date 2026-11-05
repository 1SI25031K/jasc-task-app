"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useDashboard } from "@/context/DashboardContext";
import { Avatar } from "@/components/Avatar";
import { buildHomeSummary, getHomeAlerts } from "@/lib/services";
import { getTodayJST } from "@/lib/time";
import {
  Search,
  CheckSquare,
  AlertTriangle,
  Inbox as InboxIcon,
  Smile,
  LayoutGrid,
  ArrowRight,
  X,
} from "lucide-react";
import Link from "next/link";

export default function HomePage() {
  const router = useRouter();
  const { data, currentMember, lang, dismissedAlerts, dismissAlert, t } = useDashboard();
  const [searchInput, setSearchInput] = useState("");
  const today = getTodayJST();

  const displayName =
    lang === "en" && currentMember.displayNameEn
      ? currentMember.displayNameEn
      : currentMember.displayName;

  // 時間帯に応じた挨拶文
  const hour = new Date().getHours();
  let greetingKey = "evening";
  if (hour >= 4 && hour < 11) {
    greetingKey = "morning";
  } else if (hour >= 11 && hour < 18) {
    greetingKey = "afternoon";
  }

  const greetingTmpl = t(`home.greeting_${greetingKey}`);
  const greetingText = greetingTmpl.replace("{name}", displayName);
  const summaryText = buildHomeSummary(currentMember.memberId, data.tasks, today, lang);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      router.push(`/all-tasks?q=${encodeURIComponent(searchInput.trim())}`);
    }
  };

  const actionChips = [
    { href: "/my-tasks", label: t("home.chip_my_tasks"), icon: CheckSquare },
    { href: "/alerts", label: t("home.chip_alerts"), icon: AlertTriangle },
    { href: "/inbox", label: t("home.chip_inbox"), icon: InboxIcon },
    { href: "/checkin", label: t("home.chip_checkin"), icon: Smile },
    { href: "/board", label: t("nav.board"), icon: LayoutGrid },
  ];

  const alerts = getHomeAlerts(currentMember.memberId, data.tasks, data.checkins, today, lang).filter(
    (a) => !dismissedAlerts.has(a.id)
  );

  return (
    <div className="mx-auto max-w-3xl px-4 pt-12 sm:pt-16">
      {/* 1. 大きな丸型アバター */}
      <div className="flex justify-center mb-6">
        <Avatar name={displayName} memberId={currentMember.memberId} size={88} />
      </div>

      {/* 2. 挨拶と状況1行サマリー */}
      <div className="text-center mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-800">
          {greetingText}
        </h1>
        <p className="mt-2 text-sm sm:text-base text-slate-500 font-medium">{summaryText}</p>
      </div>

      {/* 3. ピル型の大きな検索バー */}
      <form onSubmit={handleSearch} className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={`🔍  ${t("home.search_placeholder")}`}
          className="w-full rounded-full border border-slate-300 bg-white py-3.5 pl-12 pr-6 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition"
        />
      </form>

      {/* 4. 横並びアクションチップ */}
      <div className="flex flex-wrap items-center justify-center gap-2 mb-10">
        {actionChips.map((chip) => {
          const Icon = chip.icon;
          return (
            <Link
              key={chip.href}
              href={chip.href}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-700 shadow-xs hover:border-blue-500 hover:bg-blue-50/50 hover:text-blue-700 transition"
            >
              <Icon className="h-4 w-4 text-slate-500" />
              <span>{chip.label}</span>
            </Link>
          );
        })}
      </div>

      {/* 5. おすすめ・お知らせカード */}
      {alerts.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 px-1">
            {lang === "en" ? "Action Items" : "要対応のお知らせ"}
          </h2>

          <div className="space-y-3">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-slate-300"
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                      alert.type === "alerts"
                        ? "bg-red-100 text-red-600"
                        : alert.type === "inbox"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-purple-100 text-purple-700"
                    }`}
                  >
                    {alert.type === "alerts" && <AlertTriangle className="h-5 w-5" />}
                    {alert.type === "inbox" && <InboxIcon className="h-5 w-5" />}
                    {alert.type === "checkin" && <Smile className="h-5 w-5" />}
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-800 text-base">{alert.title}</h3>
                    <p className="mt-0.5 text-xs sm:text-sm text-slate-500">{alert.desc}</p>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 shrink-0">
                  <button
                    onClick={() => dismissAlert(alert.id)}
                    className="rounded-full px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 transition"
                  >
                    {t("home.dismiss_btn")}
                  </button>
                  <Link
                    href={alert.targetHref}
                    className="flex items-center gap-1 rounded-full bg-blue-600 px-4 py-1.5 text-xs font-medium text-white shadow-xs hover:bg-blue-700 transition"
                  >
                    <span>{t("home.open_btn")}</span>
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

