import jaDict from "./ja.json";
import enDict from "./en.json";

export type LangCode = "ja" | "en";

const dictionaries: Record<LangCode, any> = {
  ja: jaDict,
  en: enDict,
};

/**
 * 多言語辞書からキーを取得し、プレースホルダー {key} を置換する
 */
export function t(
  path: string,
  lang: LangCode = "ja",
  params?: Record<string, string | number>
): string {
  const dict = dictionaries[lang] || jaDict;
  const parts = path.split(".");
  let current: any = dict;

  for (const part of parts) {
    if (current && typeof current === "object" && part in current) {
      current = current[part];
    } else {
      // フォールバック: ja
      let fb: any = jaDict;
      for (const p of parts) {
        if (fb && typeof fb === "object" && p in fb) {
          fb = fb[p];
        } else {
          return path;
        }
      }
      current = fb;
      break;
    }
  }

  if (typeof current !== "string") {
    return path;
  }

  let text = current;
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      text = text.replaceAll(`{${key}}`, String(value));
    }
  }

  // Streamlit 由来の :material/xxx: 記法を除去またはアイコンに置換
  text = text.replace(/:material\/[a-z_]+:/g, "").trim();

  return text;
}

