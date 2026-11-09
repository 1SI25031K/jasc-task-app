"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useDashboard } from "@/context/DashboardContext";
import { Avatar } from "@/components/Avatar";
import { MaterialIcon } from "@/components/MaterialIcon";
import { buildHomeSummary, getHomeAlerts } from "@/lib/services";
import { getTodayJST, getGreetingKey } from "@/lib/time";
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

  // 時間帯に応じた挨拶文（Asia/Tokyo 基準: 7.6-B）
  const greetingKey = getGreetingKey();
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
    { href: "/my-tasks", label: t("home.chip_my_tasks"), icon: "check_circle" },
    { href: "/inbox", label: t("home.chip_inbox"), icon: "inbox" },
    { href: "/alerts", label: t("home.chip_alerts"), icon: "warning" },
    { href: "/checkin", label: t("home.chip_checkin"), icon: "mood" },
    { href: "/minutes", label: t("home.chip_minutes"), icon: "auto_awesome" },
    { href: "/board", label: t("nav.board"), icon: "grid_view" },
  ];

  const alerts = getHomeAlerts(currentMember.memberId, data.tasks, data.checkins, today, lang).filter(
    (a) => !dismissedAlerts.has(a.id)
  );

  return (
    <div className="mx-auto max-w-2xl px-2 pt-6 sm:pt-10">
      {/* 1. 大きな丸型アバター (88px) */}
      <div className="flex justify-center mb-5">
        <Avatar name={displayName} memberId={currentMember.memberId} size={88} />
      </div>

      {/* 2. 挨拶と状況1行サマリー */}
      <div className="text-center mb-8">
        <h1 className="text-2xl sm:text-3xl font-normal text-on-surface tracking-tight">
          {greetingText}
        </h1>
        <p className="mt-2 text-sm sm:text-base text-on-surface-variant font-normal">
          {summaryText}
        </p>
      </div>

      {/* 3. M3 ピル型 Search bar (56px, 塗り surface-container-high, 枠線なし) */}
      <form onSubmit={handleSearch} className="relative mb-6">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant flex items-center pointer-events-none">
          <MaterialIcon name="search" className="text-2xl" />
        </div>
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={t("home.search_placeholder")}
          aria-label={t("home.search_placeholder")}
          className="w-full h-14 rounded-full border-none bg-surface-container-high pl-12 pr-6 text-sm text-on-surface placeholder:text-on-surface-variant hover:bg-surface-container-highest focus:bg-surface-container-lowest focus:outline-none focus-visible:ring-2 focus-visible:ring-primary transition duration-short4"
        />
      </form>

      {/* 4. M3 Assist Chips (高さ 32px, 角丸 8px, 1px outline-variant, タッチ範囲 48px) */}
      <div className="flex flex-wrap items-center justify-center gap-2 mb-10">
        {actionChips.map((chip) => (
          <Link
            key={chip.href}
            href={chip.href}
            className="group relative flex items-center gap-2 h-8 rounded-[8px] border border-outline-variant bg-surface-container-lowest pl-2 pr-4 text-sm font-medium text-on-surface hover:bg-surface-container-high active:bg-surface-container-highest transition m3-interactive before:absolute before:-inset-2 before:content-['']"
          >
            <MaterialIcon name={chip.icon} className="text-[18px] text-primary" />
            <span>{chip.label}</span>
          </Link>
        ))}
      </div>

      {/* 5. おすすめ・お知らせカード (Level 0 flat, 枠線なし, 影なし, 角丸 28px) */}
      {alerts.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xs font-medium text-on-surface-variant tracking-wider px-1">
            {lang === "en" ? "ACTION ITEMS" : "要対応のお知らせ"}
          </h2>

          <div className="space-y-3">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-[28px] bg-surface-container-lowest p-5 border-none shadow-none transition"
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                      alert.type === "alerts"
                        ? "bg-error-container text-on-error-container"
                        : alert.type === "inbox"
                        ? "bg-primary-container text-on-primary-container"
                        : "bg-tertiary-container text-on-tertiary-container"
                    }`}
                  >
                    <MaterialIcon
                      name={
                        alert.type === "alerts"
                          ? "warning"
                          : alert.type === "inbox"
                          ? "inbox"
                          : "mood"
                      }
                      className="text-xl"
                    />
                  </div>
                  <div>
                    <h3 className="font-medium text-on-surface text-base">{alert.title}</h3>
                    <p className="mt-0.5 text-xs sm:text-sm text-on-surface-variant">{alert.desc}</p>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 shrink-0">
                  <button
                    onClick={() => dismissAlert(alert.id)}
                    className="h-9 px-3 rounded-full text-xs font-medium text-on-surface-variant hover:bg-surface-container-high active:bg-surface-container-highest transition m3-interactive"
                  >
                    {t("home.dismiss_btn")}
                  </button>
                  <Link
                    href={alert.targetHref}
                    className="flex items-center gap-1.5 h-9 px-4 rounded-full bg-primary text-xs font-medium text-on-primary hover:bg-primary/90 transition m3-interactive"
                  >
                    <span>{t("home.open_btn")}</span>
                    <MaterialIcon name="arrow_forward" className="text-sm text-on-primary" />
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
