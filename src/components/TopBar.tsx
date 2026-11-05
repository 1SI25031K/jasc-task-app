"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useDashboard } from "@/context/DashboardContext";
import { Avatar } from "./Avatar";
import { RefreshCw, HelpCircle, Globe, LogOut, Check } from "lucide-react";
import { signOut } from "next-auth/react";

export function TopBar() {
  const { currentMember, lang, setLang, userEmail, isRefreshing, refresh, t } = useDashboard();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // 外側クリックでメニューを閉じる
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
        setHelpOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const displayName = lang === "en" && currentMember.displayNameEn ? currentMember.displayNameEn : currentMember.displayName;

  return (
    <header className="sticky top-0 z-40 h-16 w-full border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* 左: ロゴ・タイトル */}
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 group">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-base font-bold text-white shadow-sm transition group-hover:bg-blue-700">
              J
            </span>
            <span className="text-lg font-bold tracking-tight text-slate-800">
              {t("app.title")}
            </span>
          </Link>
        </div>

        {/* 右: 操作アイコン群 */}
        <div className="flex items-center gap-2 sm:gap-3" ref={menuRef}>
          {/* データ更新ボタン */}
          <button
            onClick={refresh}
            disabled={isRefreshing}
            title={lang === "en" ? "Refresh data" : "最新データに更新"}
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50 transition"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin text-blue-600" : ""}`} />
          </button>

          {/* ヘルプボタン */}
          <div className="relative">
            <button
              onClick={() => {
                setHelpOpen(!helpOpen);
                setUserMenuOpen(false);
              }}
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition"
              title={t("app.help_title")}
            >
              <HelpCircle className="h-4 w-4" />
            </button>

            {helpOpen && (
              <div className="absolute right-0 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-lg z-50 text-sm">
                <h3 className="font-semibold text-slate-800 mb-2">{t("app.help_title")}</h3>
                <div className="space-y-2 text-xs text-slate-600">
                  <p>・<strong>ホーム</strong>：全体の状況サマリーとお知らせの確認</p>
                  <p>・<strong>役職ボード</strong>：全21役職の担当者・残タスク・NA進捗</p>
                  <p>・<strong>マイタスク</strong>：自分の担当タスクの確認</p>
                  <p>・<strong>期限アラート</strong>：期限切れ・今週期限・停滞タスクの監視</p>
                  <p>・<strong>余力マップ</strong>：自動負荷と体感スコア（1〜10）の乖離検知</p>
                </div>
              </div>
            )}
          </div>

          {/* ユーザーアバター＆ポップオーバーメニュー */}
          <div className="relative">
            <button
              onClick={() => {
                setUserMenuOpen(!userMenuOpen);
                setHelpOpen(false);
              }}
              className="flex items-center gap-2 rounded-full p-0.5 hover:ring-2 hover:ring-blue-100 transition"
            >
              <Avatar name={displayName} memberId={currentMember.memberId} size={36} />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl z-50">
                {/* ユーザー情報 */}
                <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                  <Avatar name={displayName} memberId={currentMember.memberId} size={44} />
                  <div className="overflow-hidden">
                    <p className="truncate font-semibold text-slate-800">{displayName}</p>
                    <p className="truncate text-xs text-slate-500">{userEmail}</p>
                  </div>
                </div>

                {/* 言語切替 */}
                <div className="py-3 border-b border-slate-100">
                  <p className="mb-2 text-xs font-medium text-slate-400 uppercase tracking-wider">
                    {t("app.lang_label")}
                  </p>
                  <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 text-xs">
                    <button
                      onClick={() => setLang("ja")}
                      className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 font-medium transition ${
                        lang === "ja" ? "bg-white text-slate-800 shadow-sm" : "text-slate-600 hover:text-slate-800"
                      }`}
                    >
                      {lang === "ja" && <Check className="h-3 w-3 text-blue-600" />}
                      日本語
                    </button>
                    <button
                      onClick={() => setLang("en")}
                      className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 font-medium transition ${
                        lang === "en" ? "bg-white text-slate-800 shadow-sm" : "text-slate-600 hover:text-slate-800"
                      }`}
                    >
                      {lang === "en" && <Check className="h-3 w-3 text-blue-600" />}
                      English
                    </button>
                  </div>
                </div>

                {/* ログアウト */}
                <div className="pt-2">
                  <button
                    onClick={() => signOut({ callbackUrl: "/login" })}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-red-600 hover:bg-red-50 transition"
                  >
                    <LogOut className="h-4 w-4" />
                    {t("app.logout_btn")}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

