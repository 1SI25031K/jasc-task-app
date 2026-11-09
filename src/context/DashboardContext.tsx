"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { DashboardData } from "@/lib/data";
import { Member } from "@/lib/schemas";
import { LangCode, t as translate } from "@/lib/i18n";
import { useRouter } from "next/navigation";

interface DashboardContextType {
  data: DashboardData;
  currentMember: Member;
  userEmail: string;
  lang: LangCode;
  setLang: (l: LangCode) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  dismissedAlerts: Set<string>;
  dismissAlert: (id: string) => void;
  isRefreshing: boolean;
  refresh: () => Promise<void>;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const DashboardContext = createContext<DashboardContextType | null>(null);

export function DashboardProvider({
  children,
  initialData,
  userEmail,
}: {
  children: React.ReactNode;
  initialData: DashboardData;
  userEmail: string;
}) {
  const router = useRouter();
  const [data, setData] = useState<DashboardData>(initialData);
  const [lang, setLangState] = useState<LangCode>("ja");
  const [searchQuery, setSearchQuery] = useState("");
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);

  // initialData が更新されたら state に同期（チェックインやタスク更新の即時反映）
  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  // ログインユーザーに一致する member を取得、なければ先頭のアクティブメンバー
  const currentMember =
    data.members.find((m) => m.email.toLowerCase() === userEmail.toLowerCase()) ||
    data.members.find((m) => m.active) ||
    data.members[0] || {
      memberId: "m_default",
      displayName: "ゲスト",
      displayNameEn: "Guest",
      email: userEmail,
      mainRoles: "",
      lang: "ja",
      slackUserId: "",
      remindersEnabled: false,
      isAdmin: false,
      active: true,
      bgMode: "none",
      bgColor: "",
    };

  // localStorage から言語設定を復元
  useEffect(() => {
    const savedLang = localStorage.getItem("jasc_lang") as LangCode;
    if (savedLang === "ja" || savedLang === "en") {
      setLangState(savedLang);
    } else if (currentMember.lang === "en") {
      setLangState("en");
    }
  }, [currentMember.lang]);

  const setLang = (newLang: LangCode) => {
    setLangState(newLang);
    localStorage.setItem("jasc_lang", newLang);
  };

  const dismissAlert = (id: string) => {
    setDismissedAlerts((prev) => new Set([...prev, id]));
  };

  const refresh = async () => {
    try {
      setIsRefreshing(true);
      await fetch("/api/revalidate", { method: "POST" });
      router.refresh();
    } catch (e) {
      console.error("Refresh failed:", e);
    } finally {
      setIsRefreshing(false);
    }
  };

  const t = (key: string, params?: Record<string, string | number>) => {
    return translate(key, lang, params);
  };

  return (
    <DashboardContext.Provider
      value={{
        data,
        currentMember,
        userEmail,
        lang,
        setLang,
        searchQuery,
        setSearchQuery,
        dismissedAlerts,
        dismissAlert,
        isRefreshing,
        refresh,
        t,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) {
    throw new Error("useDashboard must be used within DashboardProvider");
  }
  return ctx;
}

