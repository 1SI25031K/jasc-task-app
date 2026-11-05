"use client";

import React, { useState, useMemo } from "react";
import { useDashboard } from "@/context/DashboardContext";
import { calcCompletionRate, isOverdueNA } from "@/lib/services";
import { getTodayJST, parseFuzzyDate } from "@/lib/time";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { BarChart3, TrendingUp, Calendar } from "lucide-react";

export default function ProgressPage() {
  const { data, lang, t } = useDashboard();
  const [period, setPeriod] = useState<"4w" | "12w" | "all">("12w");
  const today = getTodayJST();

  // 期間フィルター
  const filteredSnapshots = useMemo(() => {
    const [y, m, d] = today.split("-").map(Number);
    const todayDate = new Date(Date.UTC(y, m - 1, d));
    let days = 3650;
    if (period === "4w") days = 28;
    if (period === "12w") days = 84;

    const startDate = new Date(todayDate.getTime() - days * 24 * 60 * 60 * 1000);
    const startStr = startDate.toISOString().slice(0, 10);

    return data.dailySnapshots.filter((s) => s.date >= startStr);
  }, [data.dailySnapshots, period, today]);

  // ① 全体完了率推移データ (scopeType === 'ALL')
  const chart1Data = useMemo(() => {
    const allSnaps = filteredSnapshots
      .filter((s) => s.scopeType === "ALL")
      .sort((a, b) => a.date.localeCompare(b.date));

    return allSnaps.map((s) => {
      const dParts = s.date.split("-");
      const shortDate = dParts.length >= 3 ? `${dParts[1]}/${dParts[2]}` : s.date;
      return {
        date: shortDate,
        rate: Math.round(s.completionRate * 100 * 10) / 10,
        fullDate: s.date,
      };
    });
  }, [filteredSnapshots]);

  // ② 役職別の現在の完了率 (横棒グラフ)
  const chart2Data = useMemo(() => {
    return data.roles
      .filter((r) => r.active)
      .map((r) => {
        const rTasks = data.tasks.filter((task) =>
          task.roleIds.split(",").map((s) => s.trim()).includes(r.roleId)
        );
        if (rTasks.length === 0) return null;
        const rate = calcCompletionRate(rTasks);
        return {
          role: lang === "en" && r.nameEn ? r.nameEn : r.name,
          rate: Math.round((rate ?? 0) * 100 * 10) / 10,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.rate - a.rate);
  }, [data.roles, data.tasks, lang]);

  // ③ 役職別の期限切れ NA 数 (横棒グラフ)
  const chart3Data = useMemo(() => {
    return data.roles
      .filter((r) => r.active)
      .map((r) => {
        const rTasks = data.tasks.filter((task) =>
          task.roleIds.split(",").map((s) => s.trim()).includes(r.roleId)
        );
        if (rTasks.length === 0) return null;
        const ovCount = rTasks.filter((t) => isOverdueNA(t, today)).length;
        return {
          role: lang === "en" && r.nameEn ? r.nameEn : r.name,
          overdue: ovCount,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.overdue - a.overdue);
  }, [data.roles, data.tasks, today, lang]);

  // ④ メンバー別の自動負荷推移
  const memberMap = new Map(data.members.map((m) => [m.memberId, m]));
  const chart4Data = useMemo(() => {
    const memberSnaps = filteredSnapshots
      .filter((s) => s.scopeType === "member")
      .sort((a, b) => a.date.localeCompare(b.date));

    const dateMap = new Map<string, any>();
    for (const s of memberSnaps) {
      const dParts = s.date.split("-");
      const shortDate = dParts.length >= 3 ? `${dParts[1]}/${dParts[2]}` : s.date;
      if (!dateMap.has(shortDate)) {
        dateMap.set(shortDate, { date: shortDate });
      }
      const record = dateMap.get(shortDate);
      const m = memberMap.get(s.scopeId);
      const mName = m
        ? lang === "en" && m.displayNameEn
          ? m.displayNameEn
          : m.displayName
        : s.scopeId;
      record[mName] = s.autoLoad;
    }
    return Array.from(dateMap.values());
  }, [filteredSnapshots, memberMap, lang]);

  const memberNames = Array.from(
    new Set(
      data.members
        .filter((m) => m.active)
        .map((m) => (lang === "en" && m.displayNameEn ? m.displayNameEn : m.displayName))
    )
  );

  const colors = ["#0B57D0", "#006A6A", "#146C2E", "#8B4A00", "#6B4FBB", "#904A43", "#006874", "#9C2A5C"];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* ヘッダーと期間切替 */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">{t("progress.title")}</h1>
        </div>

        {/* 期間切替ラジオボタン */}
        <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 border border-slate-200">
          {(["4w", "12w", "all"] as const).map((p) => {
            const isSelected = period === p;
            const label =
              p === "4w"
                ? t("progress.period_4w")
                : p === "12w"
                ? t("progress.period_12w")
                : t("progress.period_all");

            return (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                  isSelected ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4つのグラフグリッド */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ① 全体完了率推移 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <h2 className="text-sm font-bold text-slate-800 mb-4">{t("progress.chart1_title")}</h2>
          {chart1Data.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-xs text-slate-400 italic">
              {t("progress.empty_snaps")}
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chart1Data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#64748b" }} unit="%" />
                  <Tooltip formatter={(value: any) => [`${value}%`, lang === "en" ? "Completion" : "完了率"]} />
                  <Line type="monotone" dataKey="rate" stroke="#0B57D0" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* ② 役職別の現在の完了率 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <h2 className="text-sm font-bold text-slate-800 mb-4">{t("progress.chart2_title")}</h2>
          {chart2Data.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-xs text-slate-400 italic">
              {t("progress.empty_tasks")}
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart2Data} layout="vertical" margin={{ top: 10, right: 20, left: 20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: "#64748b" }} unit="%" />
                  <YAxis dataKey="role" type="category" tick={{ fontSize: 11, fill: "#334155" }} width={80} />
                  <Tooltip formatter={(value: any) => [`${value}%`, lang === "en" ? "Rate" : "完了率"]} />
                  <Bar dataKey="rate" fill="#0B57D0" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* ③ 役職別の期限切れ NA 数 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <h2 className="text-sm font-bold text-slate-800 mb-4">{t("progress.chart3_title")}</h2>
          {chart3Data.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-xs text-slate-400 italic">
              {t("progress.empty_overdue")}
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart3Data} layout="vertical" margin={{ top: 10, right: 20, left: 20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis dataKey="role" type="category" tick={{ fontSize: 11, fill: "#334155" }} width={80} />
                  <Tooltip formatter={(value: any) => [`${value}件`, lang === "en" ? "Overdue" : "期限切れNA"]} />
                  <Bar dataKey="overdue" fill="#B3261E" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* ④ メンバー別の自動負荷推移 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <h2 className="text-sm font-bold text-slate-800 mb-4">{t("progress.chart4_title")}</h2>
          {chart4Data.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-xs text-slate-400 italic">
              {t("progress.empty_snaps")}
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chart4Data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} unit="pt" />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
                  {memberNames.map((name, idx) => (
                    <Line
                      key={name}
                      type="monotone"
                      dataKey={name}
                      stroke={colors[idx % colors.length]}
                      strokeWidth={1.5}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

