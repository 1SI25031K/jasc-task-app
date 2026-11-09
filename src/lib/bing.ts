/**
 * Bing 今日の壁紙（HPImageArchive）APIクライアント（docs/ui_spec.md 7.7準拠）
 * S6 準拠：外部APIの文字列を直接 HTML/CSS に埋め込まず、正規表現による厳格な検証を行います。
 */

export interface BingWallpaperInfo {
  imageId: string;
  imageUrl: string;
  copyright: string;
  fetchDate: string;
}

const BING_API_URL = "https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=ja-JP";
const BING_ID_REGEX = /^[A-Za-z0-9_.\-]+$/;

// 日付ごとのキャッシュ辞書 { "YYYY-MM-DD": BingWallpaperInfo }
const dailyCache = new Map<string, BingWallpaperInfo | null>();

export function validateBingImageId(rawId: string): string | null {
  const cleanId = rawId.trim();
  if (!cleanId) return null;
  if (BING_ID_REGEX.test(cleanId)) return cleanId;
  return null;
}

export async function fetchBingTodayWallpaper(timeoutMs = 3000): Promise<BingWallpaperInfo | null> {
  // Asia/Tokyo 日付を取得
  const now = new Date();
  const jstFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayStr = jstFormatter.format(now); // "YYYY-MM-DD"

  if (dailyCache.has(todayStr)) {
    return dailyCache.get(todayStr) ?? null;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const resp = await fetch(BING_API_URL, {
      signal: controller.signal,
      headers: { "User-Agent": "JASC-TaskManager/1.0" },
      next: { revalidate: 3600 },
    });
    clearTimeout(timer);

    if (!resp.ok) {
      dailyCache.set(todayStr, null);
      return null;
    }

    const data = await resp.json();
    const images = data?.images;
    if (!Array.isArray(images) || images.length === 0) {
      dailyCache.set(todayStr, null);
      return null;
    }

    const imgData = images[0];
    const urlbase = String(imgData?.urlbase || "");
    let rawId = "";
    if (urlbase.includes("id=")) {
      rawId = urlbase.split("id=").pop() || "";
    } else if (urlbase.includes("/")) {
      rawId = urlbase.split("/").pop() || "";
    } else {
      rawId = urlbase;
    }

    const safeId = validateBingImageId(rawId);
    if (!safeId) {
      dailyCache.set(todayStr, null);
      return null;
    }

    const imageUrl = `https://www.bing.com/th?id=${safeId}_1920x1080.jpg`;
    const copyrightText = String(imgData?.copyright || "").trim();

    const info: BingWallpaperInfo = {
      imageId: safeId,
      imageUrl,
      copyright: copyrightText,
      fetchDate: todayStr,
    };

    dailyCache.set(todayStr, info);
    return info;
  } catch (e) {
    dailyCache.set(todayStr, null);
    return null;
  }
}
