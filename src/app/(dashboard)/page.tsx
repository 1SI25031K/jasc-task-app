"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useDashboard } from "@/context/DashboardContext";
import { Avatar } from "@/components/Avatar";
import { MaterialIcon } from "@/components/MaterialIcon";
import { TaskCard } from "@/components/TaskCard";
import { SafeMarkdown } from "@/components/SafeMarkdown";
import { buildHomeSummary, getHomeAlerts } from "@/lib/services";
import { getTodayJST, getGreetingKey } from "@/lib/time";
import Link from "next/link";

export default function HomePage() {
  const router = useRouter();
  const { data, currentMember, lang, dismissedAlerts, dismissAlert, t } = useDashboard();
  const [searchInput, setSearchInput] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiAnswer, setAiAnswer] = useState("");
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiDisabledNotice, setAiDisabledNotice] = useState<string | null>(null);
  const [groundedTaskIds, setGroundedTaskIds] = useState<string[]>([]);
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

  const activeTasks = useMemo(
    () => data.tasks.filter((t) => !t.archived),
    [data.tasks]
  );
  const validTaskIds = useMemo(
    () => new Set(activeTasks.map((t) => t.taskId)),
    [activeTasks]
  );

  // AI 検索実行
  const executeSearch = async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;

    setIsSearching(true);
    setIsAiLoading(true);
    setAiAnswer("");
    setAiError(null);
    setAiDisabledNotice(null);
    setGroundedTaskIds([]);

    try {
      const res = await fetch("/api/ai-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });

      if (res.status === 429) {
        const json = await res.json().catch(() => ({}));
        setAiError(json.error || (lang === "en" ? "Rate limit reached. Please wait a moment." : "利用制限に達しました。少し待ってから再度お試しください。"));
        setIsAiLoading(false);
        return;
      }

      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const json = await res.json();
        if (json.fallback) {
          setAiDisabledNotice(
            json.message ||
              (lang === "en"
                ? "AI Search is currently in preparation. Showing keyword matches."
                : "AI 検索機能は現在準備中です。通常のキーワード検索結果を表示しています。")
          );
        } else if (json.error) {
          setAiError(json.error);
        }
        setIsAiLoading(false);
        return;
      }

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setAiError(json.error || (lang === "en" ? "Search failed." : "検索に失敗しました。"));
        setIsAiLoading(false);
        return;
      }

      // レスポンスヘッダーに事前特定された task_id があれば取得
      const headerTasks = res.headers.get("X-Grounded-Tasks");
      if (headerTasks) {
        const ids = headerTasks.split(",").filter((id) => validTaskIds.has(id));
        setGroundedTaskIds(ids);
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setIsAiLoading(false);
        return;
      }

      const decoder = new TextDecoder();
      let accumulated = "";
      setIsAiLoading(false);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        accumulated += chunk;
        setAiAnswer(accumulated);

        // 回答文中の [TASK:ID] をリアルタイム抽出
        const matches = Array.from(accumulated.matchAll(/\[TASK:([A-Za-z0-9_-]+)\]/g))
          .map((m) => m[1])
          .filter((id) => validTaskIds.has(id));
        if (matches.length > 0) {
          setGroundedTaskIds((prev) => Array.from(new Set([...prev, ...matches])));
        }
      }
    } catch (err: any) {
      setAiError(err?.message || (lang === "en" ? "Network error occurred." : "通信エラーが発生しました。"));
      setIsAiLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeSearch(searchInput);
  };

  const exitSearch = () => {
    setIsSearching(false);
    setSearchInput("");
    setAiAnswer("");
    setAiError(null);
    setAiDisabledNotice(null);
    setGroundedTaskIds([]);
  };

  const handleTaskClick = (taskId: string) => {
    const el = document.getElementById(`task-card-${taskId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-primary");
      setTimeout(() => {
        el.classList.remove("ring-2", "ring-primary");
      }, 2000);
    } else {
      router.push(`/all-tasks?q=${encodeURIComponent(taskId)}`);
    }
  };

  // 関連タスクの絞り込み（AI が参照したタスク ＋ クエリのキーワードマッチ）
  const queryLower = searchInput.trim().toLowerCase();
  const matchingTasks = useMemo(() => {
    if (!isSearching) return [];
    return activeTasks.filter((t) => {
      if (groundedTaskIds.includes(t.taskId)) return true;
      if (!queryLower) return false;
      return (
        t.taskId.toLowerCase().includes(queryLower) ||
        t.title.toLowerCase().includes(queryLower) ||
        t.nextAction.toLowerCase().includes(queryLower) ||
        t.status.toLowerCase().includes(queryLower)
      );
    });
  }, [activeTasks, groundedTaskIds, isSearching, queryLower]);

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
    <div className="mx-auto max-w-2xl px-2 pt-6 sm:pt-10 space-y-6">
      {/* 検索モード時はヘッダーをコンパクトにし、戻るボタンを提供 */}
      {!isSearching ? (
        <>
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
        </>
      ) : (
        <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
          <button
            onClick={exitSearch}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-on-surface-variant hover:text-on-surface transition m3-interactive py-1 px-2 rounded-full"
          >
            <MaterialIcon name="arrow_back" size={18} />
            <span>{lang === "en" ? "Back to Dashboard" : "ダッシュボードに戻る"}</span>
          </button>
          <span className="text-xs text-on-surface-variant">
            {lang === "en" ? "Search View" : "検索ビュー"}
          </span>
        </div>
      )}

      {/* 3. M3 Search bar (56px, 塗り surface-container-high, 枠線なし, 角丸 full) */}
      <form onSubmit={handleSearchSubmit} className="relative">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant flex items-center pointer-events-none">
          <MaterialIcon name={isSearching ? "auto_awesome" : "search"} className="text-2xl text-primary" />
        </div>
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={
            lang === "en"
              ? "Ask AI or search tasks (e.g. What are my tasks due this week?)"
              : "AI に質問またはタスクを検索（例: 今週期限の私のタスクは？）"
          }
          aria-label={t("home.search_placeholder")}
          className="w-full h-14 rounded-full border-none bg-surface-container-high pl-12 pr-24 text-sm text-on-surface placeholder:text-on-surface-variant hover:bg-surface-container-highest focus:bg-surface-container-lowest focus:outline-none focus-visible:ring-2 focus-visible:ring-primary transition duration-short4"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              className="flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface transition"
              title="クリア"
            >
              <MaterialIcon name="close" size={18} />
            </button>
          )}
          <button
            type="submit"
            disabled={!searchInput.trim()}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-on-primary hover:bg-primary/90 disabled:opacity-40 transition m3-interactive shadow-xs"
            title="検索・AIに質問"
          >
            <MaterialIcon name="arrow_forward" size={18} />
          </button>
        </div>
      </form>

      {/* 検索ビューモード表示 */}
      {isSearching && (
        <div className="space-y-6 pt-2">
          {/* ① AI 回答カード (M3 Elevated Card) */}
          <div className="rounded-[28px] bg-surface-container-lowest p-6 border-none shadow-none space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-outline-variant/20">
              <div className="flex items-center gap-2">
                <MaterialIcon name="auto_awesome" className="text-xl text-primary" />
                <h2 className="text-sm font-medium text-on-surface">
                  {lang === "en" ? "AI Answer" : "AI アシスタントの回答"}
                </h2>
              </div>
              <span className="text-[11px] text-on-surface-variant">
                Gemini
              </span>
            </div>

            {/* AI ローディング中表示 */}
            {isAiLoading && (
              <div className="space-y-3 py-2">
                <div className="flex items-center gap-2">
                  <MaterialIcon name="auto_awesome" className="text-base text-primary animate-pulse" />
                  <span className="m3-ai-shimmer-text text-xs font-medium">
                    {lang === "en" ? "Consulting project knowledge base..." : "データを参照して回答を生成しています..."}
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="h-4 w-5/6 rounded-full m3-shimmer" />
                  <div className="h-4 w-full rounded-full m3-shimmer" />
                  <div className="h-4 w-3/4 rounded-full m3-shimmer" />
                </div>
              </div>
            )}

            {/* エラー表示 */}
            {aiError && (
              <div className="flex items-center gap-2.5 rounded-[16px] bg-error-container p-3 text-xs text-on-error-container">
                <MaterialIcon name="error_outline" size={18} className="text-error shrink-0" />
                <p>{aiError}</p>
              </div>
            )}

            {/* AI 準備中通知（機能フラグ FALSE 時） */}
            {aiDisabledNotice && (
              <div className="flex items-center gap-2.5 rounded-[16px] bg-surface-container-high p-3 text-xs text-on-surface-variant">
                <MaterialIcon name="info" size={18} className="text-primary shrink-0" />
                <p>{aiDisabledNotice}</p>
              </div>
            )}

            {/* 回答本文（SafeMarkdown による安全なレンダリング） */}
            {aiAnswer && (
              <div className="text-xs sm:text-sm text-on-surface leading-relaxed">
                <SafeMarkdown
                  content={aiAnswer}
                  validTaskIds={validTaskIds}
                  onTaskClick={handleTaskClick}
                />
              </div>
            )}

            {/* 免責事項 */}
            <div className="pt-2 border-t border-outline-variant/10 flex items-center gap-1.5 text-[11px] text-on-surface-variant">
              <MaterialIcon name="info" size={14} className="text-outline shrink-0" />
              <span>
                {lang === "en"
                  ? "AI generated answer. Please verify details in the actual tasks below."
                  : "AI の回答です。正確な情報は各タスクをご確認ください。"}
              </span>
            </div>
          </div>

          {/* ② 関連タスク一覧 (M3 List) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs font-medium text-on-surface-variant tracking-wider">
                {lang === "en"
                  ? `RELATED TASKS (${matchingTasks.length})`
                  : `関連するタスク (${matchingTasks.length}件)`}
              </h3>
              <Link
                href={`/all-tasks?q=${encodeURIComponent(searchInput.trim())}`}
                className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
              >
                <span>{lang === "en" ? "View all in task list" : "全タスク一覧で検索"}</span>
                <MaterialIcon name="arrow_forward" size={14} />
              </Link>
            </div>

            {matchingTasks.length === 0 ? (
              <div className="rounded-[28px] bg-surface-container-lowest p-8 text-center text-xs text-on-surface-variant">
                {lang === "en"
                  ? "No matching tasks found for this query."
                  : "該当するタスクは見つかりませんでした。"}
              </div>
            ) : (
              <div className="rounded-[28px] bg-surface-container-lowest overflow-hidden">
                {matchingTasks.map((task) => (
                  <div
                    key={task.taskId}
                    id={`task-card-${task.taskId}`}
                    className="transition-all rounded-[28px]"
                  >
                    <TaskCard
                      task={task}
                      members={data.members}
                      roles={data.roles}
                      lang={lang}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 通常ダッシュボード表示（非検索時） */}
      {!isSearching && (
        <>
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
        </>
      )}
    </div>
  );
}
