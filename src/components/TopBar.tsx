"use client";

import React, { useState, useRef, useEffect, useTransition } from "react";
import Link from "next/link";
import { useDashboard } from "@/context/DashboardContext";
import { Avatar } from "./Avatar";
import { MaterialIcon } from "./MaterialIcon";
import { signOut } from "next-auth/react";
import { updateMemberSettingsAction } from "@/app/actions/settings";

interface TopBarProps {
  onMenuClick?: () => void;
}

const BG_COLORS = [
  { id: "standard", name: "標準", class: "bg-slate-100 border-slate-300" },
  { id: "blue", name: "青", class: "bg-blue-100 border-blue-300" },
  { id: "teal", name: "ティール", class: "bg-teal-100 border-teal-300" },
  { id: "green", name: "緑", class: "bg-emerald-100 border-emerald-300" },
  { id: "yellow", name: "黄", class: "bg-amber-100 border-amber-300" },
  { id: "orange", name: "オレンジ", class: "bg-orange-100 border-orange-300" },
  { id: "pink", name: "ピンク", class: "bg-pink-100 border-pink-300" },
  { id: "purple", name: "紫", class: "bg-purple-100 border-purple-300" },
  { id: "gray", name: "グレー", class: "bg-slate-200 border-slate-400" },
];

export function TopBar({ onMenuClick }: TopBarProps) {
  const { currentMember, lang, setLang, userEmail, isRefreshing, refresh, t } = useDashboard();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
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

  const displayName =
    lang === "en" && currentMember.displayNameEn
      ? currentMember.displayNameEn
      : currentMember.displayName;

  const handleLanguageChange = (newLang: "ja" | "en") => {
    setLang(newLang);
    startTransition(async () => {
      await updateMemberSettingsAction({ lang: newLang });
    });
  };

  const handleBgChange = (bgMode: string, bgColor: string) => {
    startTransition(async () => {
      await updateMemberSettingsAction({ bgMode, bgColor });
      await refresh();
    });
  };

  return (
    <header className="sticky top-0 z-40 h-16 w-full bg-white border-b border-[#C4C7C5]/40">
      <div className="flex h-full w-full items-center justify-between px-4 sm:px-6">
        {/* 左: ハンバーガー（タブレット・モバイル）＋ タイトル */}
        <div className="flex items-center gap-3">
          <button
            onClick={onMenuClick}
            aria-label="ナビゲーションメニューを開く"
            className="flex h-10 w-10 items-center justify-center rounded-full text-[#444746] hover:bg-[#F3EDF7] active:bg-[#ECE6F0] md:hidden transition"
          >
            <MaterialIcon name="menu" className="text-2xl" />
          </button>

          <Link href="/" className="flex items-center gap-2 group">
            <span className="text-lg font-medium text-[#1F1F1F] tracking-tight">
              {t("app.title")}
            </span>
          </Link>
        </div>

        {/* 右: 操作アイコン群 */}
        <div className="flex items-center gap-1 sm:gap-2" ref={menuRef}>
          {/* データ更新ボタン */}
          <button
            onClick={refresh}
            disabled={isRefreshing || isPending}
            title={lang === "en" ? "Refresh data" : "最新データに更新"}
            aria-label={lang === "en" ? "Refresh data" : "最新データに更新"}
            className="flex h-10 w-10 items-center justify-center rounded-full text-[#444746] hover:bg-[#F3EDF7] hover:text-[#1F1F1F] active:bg-[#ECE6F0] disabled:opacity-50 transition"
          >
            <MaterialIcon
              name="refresh"
              className={`text-xl ${isRefreshing || isPending ? "animate-spin text-[#0B57D0]" : ""}`}
            />
          </button>

          {/* ヘルプボタン */}
          <div className="relative">
            <button
              onClick={() => {
                setHelpOpen(!helpOpen);
                setUserMenuOpen(false);
              }}
              className="flex h-10 w-10 items-center justify-center rounded-full text-[#444746] hover:bg-[#F3EDF7] hover:text-[#1F1F1F] active:bg-[#ECE6F0] transition"
              title={t("app.help_title")}
              aria-label={t("app.help_title")}
            >
              <MaterialIcon name="help_outline" className="text-xl" />
            </button>

            {helpOpen && (
              <div className="absolute right-0 mt-2 w-80 rounded-[16px] border border-[#C4C7C5]/40 bg-white p-4 shadow-lg z-50 text-sm">
                <h3 className="font-medium text-[#1F1F1F] mb-2">{t("app.help_title")}</h3>
                <div className="space-y-2 text-xs text-[#444746]">
                  <p>・<strong>ホーム</strong>：全体の状況サマリーとお知らせの確認</p>
                  <p>・<strong>役職ボード</strong>：全21役職の担当者・残タスク・NA進捗</p>
                  <p>・<strong>マイタスク</strong>：自分の担当タスクの確認</p>
                  <p>・<strong>受信箱</strong>：依頼されたタスクの確認・承諾・相談</p>
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
              aria-label="アカウントメニューを開く"
              className="flex items-center gap-2 rounded-full p-0.5 hover:ring-2 hover:ring-[#D3E3FD] transition"
            >
              <Avatar name={displayName} memberId={currentMember.memberId} size={36} />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 mt-2 w-80 rounded-[28px] border border-[#C4C7C5]/40 bg-white p-5 shadow-xl z-50">
                {/* ユーザー情報 */}
                <div className="flex items-center gap-3 border-b border-[#C4C7C5]/30 pb-4">
                  <Avatar name={displayName} memberId={currentMember.memberId} size={48} />
                  <div className="overflow-hidden">
                    <p className="truncate font-medium text-base text-[#1F1F1F]">{displayName}</p>
                    <p className="truncate text-xs text-[#444746]">{userEmail}</p>
                  </div>
                </div>

                {/* 言語切替 */}
                <div className="py-4 border-b border-[#C4C7C5]/30">
                  <p className="mb-2 text-xs font-medium text-[#444746] tracking-wider">
                    {t("app.lang_label")}
                  </p>
                  <div className="grid grid-cols-2 gap-1 rounded-full bg-[#F3EDF7] p-1 text-xs">
                    <button
                      onClick={() => handleLanguageChange("ja")}
                      className={`flex items-center justify-center gap-1.5 rounded-full py-1.5 font-medium transition ${
                        lang === "ja" ? "bg-white text-[#1F1F1F] shadow-sm" : "text-[#444746] hover:text-[#1F1F1F]"
                      }`}
                    >
                      {lang === "ja" && <MaterialIcon name="check" className="text-sm text-[#0B57D0]" />}
                      日本語
                    </button>
                    <button
                      onClick={() => handleLanguageChange("en")}
                      className={`flex items-center justify-center gap-1.5 rounded-full py-1.5 font-medium transition ${
                        lang === "en" ? "bg-white text-[#1F1F1F] shadow-sm" : "text-[#444746] hover:text-[#1F1F1F]"
                      }`}
                    >
                      {lang === "en" && <MaterialIcon name="check" className="text-sm text-[#0B57D0]" />}
                      English
                    </button>
                  </div>
                </div>

                {/* 背景設定 */}
                <div className="py-4 border-b border-[#C4C7C5]/30">
                  <div className="flex items-center gap-1.5 mb-2 text-xs font-medium text-[#444746] tracking-wider">
                    <MaterialIcon name="palette" className="text-sm" />
                    <span>背景モード</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 rounded-full bg-[#F3EDF7] p-1 text-xs mb-3">
                    {[
                      { id: "standard", label: "標準" },
                      { id: "color", label: "カラー" },
                      { id: "bing", label: "Bing画像" },
                    ].map((mode) => (
                      <button
                        key={mode.id}
                        onClick={() => handleBgChange(mode.id, currentMember.bgColor || "standard")}
                        className={`rounded-full py-1 text-center font-medium transition ${
                          (currentMember.bgMode || "standard") === mode.id
                            ? "bg-white text-[#1F1F1F] shadow-sm"
                            : "text-[#444746] hover:text-[#1F1F1F]"
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>

                  {currentMember.bgMode === "color" && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {BG_COLORS.map((c) => (
                        <button
                          key={c.id}
                          title={c.name}
                          onClick={() => handleBgChange("color", c.id)}
                          className={`h-6 w-6 rounded-full border-2 transition ${c.class} ${
                            (currentMember.bgColor || "standard") === c.id ? "ring-2 ring-[#0B57D0] scale-110" : ""
                          }`}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* ログアウト */}
                <div className="pt-3">
                  <button
                    onClick={() => signOut({ callbackUrl: "/login" })}
                    className="flex w-full items-center gap-2 rounded-full px-3 py-2 text-sm text-[#B3261E] hover:bg-[#F9DEDC]/50 transition"
                  >
                    <MaterialIcon name="logout" className="text-base text-[#B3261E]" />
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
