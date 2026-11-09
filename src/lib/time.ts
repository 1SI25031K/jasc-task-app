import { format, parseISO, startOfDay, addDays, isBefore, isAfter, isValid } from "date-fns";
import { toZonedTime, format as formatTz } from "date-fns-tz";
import { CONFIG } from "./config";

export const TIME_ZONE = CONFIG.timeZone;

/**
 * 現在の JST 時刻を取得する
 */
export function nowJST(): Date {
  return toZonedTime(new Date(), TIME_ZONE);
}

/**
 * 現在の JST 日付文字列 (YYYY-MM-DD) を取得する
 */
export function getTodayJST(): string {
  return formatTz(new Date(), "yyyy-MM-dd", { timeZone: TIME_ZONE });
}

/**
 * 現在時刻（Asia/Tokyo）から時間帯に応じた挨拶キー（'morning' / 'afternoon' / 'evening'）を判定する（7.6-B）。
 * - 5:00 〜 10:59: 'morning'（おはようございます）
 * - 11:00 〜 17:59: 'afternoon'（こんにちは）
 * - 18:00 〜 翌4:59: 'evening'（こんばんは）
 */
export function getGreetingKey(date = new Date()): "morning" | "afternoon" | "evening" {
  const jst = toZonedTime(date, TIME_ZONE);
  const hour = jst.getHours();
  if (hour >= 5 && hour < 11) {
    return "morning";
  }
  if (hour >= 11 && hour < 18) {
    return "afternoon";
  }
  return "evening";
}

/**
 * 日付文字列の年度を補完して Date オブジェクトに変換する。
 * 例: "2026-09" 開始の場合:
 * - "2026-11-04" -> Date(2026, 10, 4)
 * - "11/4" -> 2026-11-04
 * - "2/15" -> 2027-02-15
 * - "10/1\n10/2" -> 最初の "10/1" を採用
 * - "1/14-17 第１次選考合宿" -> 最初の "1/14" を採用
 */
export function parseFuzzyDate(raw: string | null | undefined, academicYearStart = CONFIG.academicYearStart): {
  parsedDate: Date | null;
  dateString: string | null;
  rawString: string;
} {
  if (!raw || typeof raw !== "string") {
    return { parsedDate: null, dateString: null, rawString: "" };
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return { parsedDate: null, dateString: null, rawString: "" };
  }

  // 1. 完全な YYYY-MM-DD 形式
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const [_, y, m, d] = isoMatch;
    const year = parseInt(y, 10);
    const month = parseInt(m, 10);
    const day = parseInt(d, 10);
    const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    if (isValid(date)) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      return { parsedDate: date, dateString: dateStr, rawString: trimmed };
    }
  }

  // 2. M/D 形式（例: 9/2, 10/1\n10/2, 1/14-17 合宿）
  const mdMatch = trimmed.match(/(\d{1,2})\/(\d{1,2})/);
  if (mdMatch) {
    const month = parseInt(mdMatch[1], 10);
    const day = parseInt(mdMatch[2], 10);

    const [startYearStr, startMonthStr] = academicYearStart.split("-");
    const startYear = parseInt(startYearStr, 10);
    const startMonth = parseInt(startMonthStr, 10);

    // 開始月以降なら開始年、開始月より前なら翌年
    const year = month >= startMonth ? startYear : startYear + 1;
    const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    if (isValid(date)) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      return { parsedDate: date, dateString: dateStr, rawString: trimmed };
    }
  }

  // 解釈不能な場合は生の文字列のみ保持
  return { parsedDate: null, dateString: null, rawString: trimmed };
}

/**
 * 期限切れ判定（要件定義書 5.5 準拠）
 * status != "完了" かつ na_due < today
 */
export function isOverdue(dateStr: string | null | undefined, referenceToday = getTodayJST()): boolean {
  if (!dateStr) return false;
  const { dateString } = parseFuzzyDate(dateStr);
  if (!dateString) return false;
  return dateString < referenceToday;
}

/**
 * 今週期限判定（要件定義書 5.5 準拠）
 * status != "完了" かつ today <= na_due <= today + 7日
 */
export function isDueThisWeek(dateStr: string | null | undefined, referenceToday = getTodayJST()): boolean {
  if (!dateStr) return false;
  const { dateString } = parseFuzzyDate(dateStr);
  if (!dateString) return false;

  const [y, m, d] = referenceToday.split("-").map(Number);
  const todayDate = new Date(Date.UTC(y, m - 1, d));
  const weekLaterDate = addDays(todayDate, 7);
  const weekLaterStr = format(weekLaterDate, "yyyy-MM-dd");

  return dateString >= referenceToday && dateString <= weekLaterStr;
}

/**
 * 停滞判定（要件定義書 5.5 準拠）
 * (now - updated_at) >= 7日
 */
export function isStale(updatedAtStr: string | null | undefined, staleDays = 7): boolean {
  if (!updatedAtStr) return false;
  const trimmed = updatedAtStr.trim();
  const { dateString } = parseFuzzyDate(trimmed);
  if (!dateString) return false;

  const [y, m, d] = dateString.split("-").map(Number);
  const updatedDate = new Date(Date.UTC(y, m - 1, d));
  const todayStr = getTodayJST();
  const [ty, tm, td] = todayStr.split("-").map(Number);
  const todayDate = new Date(Date.UTC(ty, tm - 1, td));

  const staleThreshold = addDays(updatedDate, staleDays);
  return isBefore(staleThreshold, todayDate) || format(staleThreshold, "yyyy-MM-dd") === todayStr;
}

