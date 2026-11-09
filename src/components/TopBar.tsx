"use client";

import React, { useState, useRef, useEffect, useTransition } from "react";
import Link from "next/link";
import { useDashboard } from "@/context/DashboardContext";
import { useSnackbar } from "@/context/SnackbarContext";
import { Avatar } from "./Avatar";
import { MaterialIcon } from "./MaterialIcon";
import { signOut } from "next-auth/react";
import { updateMemberSettingsAction } from "@/app/actions/settings";
import { BingWallpaperInfo } from "@/lib/bing";

interface TopBarProps {
  onMenuClick?: () => void;
  bingWallpaper?: BingWallpaperInfo | null;
}

// 7.7 準拠の 9 色パレット
export const BG_PALETTES: Record<string, { hex: string; nameJa: string; nameEn: string }> = {
  standard: { hex: "#F0F4F9", nameJa: "標準", nameEn: "Standard" },
  blue: { hex: "#E8F0FE", nameJa: "ブルー", nameEn: "Blue" },
  teal: { hex: "#E0F2F1", nameJa: "ティール", nameEn: "Teal" },
  green: { hex: "#E6F4EA", nameJa: "グリーン", nameEn: "Green" },
  yellow: { hex: "#FEF7E0", nameJa: "イエロー", nameEn: "Yellow" },
  orange: { hex: "#FEEFE3", nameJa: "オレンジ", nameEn: "Orange" },
  pink: { hex: "#FCE8F0", nameJa: "ピンク", nameEn: "Pink" },
  purple: { hex: "#F3E8FD", nameJa: "パープル", nameEn: "Purple" },
  gray: { hex: "#F1F3F4", nameJa: "グレー", nameEn: "Gray" },
};

export function TopBar({ onMenuClick, bingWallpaper }: TopBarProps) {
  const { currentMember, lang, setLang, userEmail, isRefreshing, refresh, t } = useDashboard();
  const { showSnackbar } = useSnackbar();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [bgOpen, setBgOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const menuRef = useRef<HTMLDivElement>(null);
  const helpRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);

  // 外側クリックでメニューを閉じる
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) {
        setUserMenuOpen(false);
      }
      if (helpRef.current && !helpRef.current.contains(target)) {
        setHelpOpen(false);
      }
      if (bgRef.current && !bgRef.current.contains(target)) {
        setBgOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // タブ復帰時（60秒以上経過時）および5分間隔での自動データ更新（作業1-7: 更新ボタン廃止に伴う自動化）
  useEffect(() => {
    let lastFetched = Date.now();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        if (Date.now() - lastFetched > 60 * 1000) {
          lastFetched = Date.now();
          refresh();
        }
      }
    };

    const intervalTimer = setInterval(() => {
      lastFetched = Date.now();
      refresh();
    }, 5 * 60 * 1000);

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      clearInterval(intervalTimer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refresh]);

  const displayName =
    lang === "en" && currentMember.displayNameEn
      ? currentMember.displayNameEn
      : currentMember.displayName;

  const handleLanguageChange = (newLang: "ja" | "en") => {
    setLang(newLang);
    startTransition(async () => {
      await updateMemberSettingsAction({ lang: newLang });
      showSnackbar({ message: newLang === "en" ? "Language updated to English" : "表示言語を日本語に切り替えました" });
    });
  };

  const handleBgColorSelect = (colorKey: string) => {
    const newMode = colorKey === "standard" ? "standard" : "color";
    startTransition(async () => {
      await updateMemberSettingsAction({ bgMode: newMode, bgColor: colorKey });
      await refresh();
      showSnackbar({ message: lang === "en" ? "Background updated" : "背景設定を保存しました" });
    });
  };

  const handleBingToggle = (enabled: boolean) => {
    const newMode = enabled ? "bing" : currentMember.bgColor && currentMember.bgColor !== "standard" ? "color" : "standard";
    startTransition(async () => {
      await updateMemberSettingsAction({ bgMode: newMode, bgColor: currentMember.bgColor || "standard" });
      await refresh();
      showSnackbar({
        message: enabled
          ? lang === "en"
            ? "Bing Today's Wallpaper applied"
            : "「今日の景色（Bing）」を背景に適用しました"
          : lang === "en"
          ? "Wallpaper reset to selected color"
          : "背景色に戻しました",
      });
    });
  };

  const isBing = currentMember.bgMode === "bing";
  const activeColorKey = currentMember.bgColor || "standard";

  return (
    <header className="sticky top-0 z-40 h-16 w-full bg-surface">
      <div className="flex h-full w-full items-center justify-between px-4 sm:px-6">
        {/* 左: ハンバーガー（モバイル）＋ アプリ名 */}
        <div className="flex items-center gap-3">
          <button
            onClick={onMenuClick}
            aria-label="ナビゲーションメニューを開く"
            className="m3-interactive flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface md:hidden transition"
          >
            <MaterialIcon name="menu" size={24} />
          </button>

          <Link href="/" className="flex items-center gap-2">
            <span className="text-[22px] font-normal text-on-surface tracking-tight">
              {t("app.title")}
            </span>
          </Link>
        </div>

        {/* 右: 操作アイコン群（ヘルプ・背景設定・アバター） */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* ヘルプボタン */}
          <div className="relative" ref={helpRef}>
            <button
              onClick={() => {
                setHelpOpen(!helpOpen);
                setUserMenuOpen(false);
                setBgOpen(false);
              }}
              className="m3-interactive flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface transition"
              title={t("app.help_title")}
              aria-label={t("app.help_title")}
            >
              <MaterialIcon name="help_outline" size={22} />
            </button>

            {helpOpen && (
              <div className="absolute right-0 mt-2 w-80 rounded-m3-lg bg-surface-container-high p-4 shadow-xl z-50 text-sm border-none">
                <h3 className="font-medium text-on-surface mb-2">{t("app.help_title")}</h3>
                <div className="space-y-2 text-xs text-on-surface-variant">
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

          {/* 背景設定ボタン（作業1-9: 7.7 準拠の wallpaper ポップオーバー） */}
          <div className="relative" ref={bgRef}>
            <button
              onClick={() => {
                setBgOpen(!bgOpen);
                setUserMenuOpen(false);
                setHelpOpen(false);
              }}
              className="m3-interactive flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface transition"
              title={lang === "en" ? "Background Settings" : "背景の設定"}
              aria-label={lang === "en" ? "Background Settings" : "背景の設定"}
            >
              <MaterialIcon name="wallpaper" size={22} />
            </button>

            {bgOpen && (
              <div className="absolute right-0 mt-2 w-80 rounded-m3-lg bg-surface-container-high p-5 shadow-xl z-50 text-xs text-on-surface-variant border-none">
                <h3 className="font-medium text-sm text-on-surface mb-3">
                  {lang === "en" ? "Background" : "背景"}
                </h3>

                {/* 9色のカラーサークル（直径 32px） */}
                <div className="grid grid-cols-5 gap-2.5 mb-4">
                  {Object.entries(BG_PALETTES).map(([key, item]) => {
                    const isSelected = !isBing && activeColorKey === key;
                    return (
                      <button
                        key={key}
                        onClick={() => handleBgColorSelect(key)}
                        disabled={isPending}
                        title={lang === "en" ? item.nameEn : item.nameJa}
                        className={`h-8 w-8 rounded-full border border-black/10 flex items-center justify-center transition-all ${
                          isSelected ? "ring-2 ring-primary ring-offset-2 scale-105" : "hover:scale-105"
                        }`}
                        style={{ backgroundColor: item.hex }}
                      >
                        {isSelected && <MaterialIcon name="check" size={16} className="text-primary" />}
                      </button>
                    );
                  })}
                </div>

                <div className="h-px bg-outline-variant/30 my-3" />

                {/* 今日の景色（Bing Wallpaper）スイッチ */}
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="font-medium text-on-surface">
                      {lang === "en" ? "Today's Scenery" : "今日の景色"}
                    </span>
                    <p className="text-[11px] text-on-surface-variant">
                      {lang === "en" ? "Set Bing image of the day" : "Bing の今日の画像を背景にします"}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isBing}
                    onClick={() => handleBingToggle(!isBing)}
                    disabled={isPending}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      isBing ? "bg-primary" : "bg-outline-variant"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                        isBing ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {isBing && !bingWallpaper && (
                  <p className="mt-2 text-[11px] text-on-surface-variant italic">
                    ※ {lang === "en" ? "Connecting to scenery service..." : "画像を取得中またはフォールバック中です"}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* ユーザーアバター＆ポップオーバーメニュー */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => {
                setUserMenuOpen(!userMenuOpen);
                setHelpOpen(false);
                setBgOpen(false);
              }}
              aria-label="アカウントメニューを開く"
              className="flex items-center gap-2 rounded-full p-0.5 hover:ring-2 hover:ring-primary-container transition"
            >
              <Avatar name={displayName} memberId={currentMember.memberId} size={36} />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 mt-2 w-80 rounded-m3-xl bg-surface-container-high p-5 shadow-2xl z-50 border-none">
                {/* ユーザー情報 */}
                <div className="flex items-center gap-3 border-b border-outline-variant/30 pb-4">
                  <Avatar name={displayName} memberId={currentMember.memberId} size={48} />
                  <div className="overflow-hidden">
                    <p className="truncate font-medium text-base text-on-surface">{displayName}</p>
                    <p className="truncate text-xs text-on-surface-variant">{userEmail}</p>
                  </div>
                </div>

                {/* 言語切替 */}
                <div className="py-4 border-b border-outline-variant/30">
                  <p className="mb-2 text-xs font-medium text-on-surface-variant tracking-wider">
                    {t("app.lang_label")}
                  </p>
                  <div className="grid grid-cols-2 gap-1 rounded-full bg-surface-container p-1 text-xs">
                    <button
                      onClick={() => handleLanguageChange("ja")}
                      className={`flex items-center justify-center gap-1.5 rounded-full py-1.5 font-medium transition ${
                        lang === "ja" ? "bg-surface-container-lowest text-on-surface shadow-xs" : "text-on-surface-variant hover:text-on-surface"
                      }`}
                    >
                      {lang === "ja" && <MaterialIcon name="check" size={16} className="text-primary" />}
                      日本語
                    </button>
                    <button
                      onClick={() => handleLanguageChange("en")}
                      className={`flex items-center justify-center gap-1.5 rounded-full py-1.5 font-medium transition ${
                        lang === "en" ? "bg-surface-container-lowest text-on-surface shadow-xs" : "text-on-surface-variant hover:text-on-surface"
                      }`}
                    >
                      {lang === "en" && <MaterialIcon name="check" size={16} className="text-primary" />}
                      English
                    </button>
                  </div>
                </div>

                {/* 手動データ更新（上部バーから移設） */}
                <div className="py-2 border-b border-outline-variant/30">
                  <button
                    onClick={() => {
                      refresh();
                      setUserMenuOpen(false);
                      showSnackbar({ message: lang === "en" ? "Data refreshed" : "最新データに更新しました" });
                    }}
                    disabled={isRefreshing}
                    className="m3-interactive flex w-full items-center gap-2.5 rounded-full px-3 py-2 text-xs font-medium text-on-surface hover:bg-white/8 transition"
                  >
                    <MaterialIcon name="refresh" size={18} className={isRefreshing ? "animate-spin text-primary" : ""} />
                    <span>{lang === "en" ? "Refresh data" : "最新データに更新"}</span>
                  </button>
                </div>

                {/* ログアウト */}
                <div className="pt-2">
                  <button
                    onClick={() => signOut({ callbackUrl: "/login" })}
                    className="m3-interactive flex w-full items-center gap-2 rounded-full px-3 py-2 text-sm text-error hover:bg-error-container/40 transition"
                  >
                    <MaterialIcon name="logout" size={18} className="text-error" />
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
