import { google } from "googleapis";
import { getGoogleAuth } from "./google/auth";
import { updateSheetRow } from "./google/sheets";
import { Member } from "./schemas";

export function memberToRow(m: Member): string[] {
  return [
    m.memberId,
    m.displayName,
    m.displayNameEn || "",
    m.email || "",
    m.mainRoles || "",
    m.lang || "ja",
    m.slackUserId || "",
    m.remindersEnabled ? "TRUE" : "FALSE",
    m.isAdmin ? "TRUE" : "FALSE",
    m.active ? "TRUE" : "FALSE",
    m.bgMode || "standard",
    m.bgColor || "standard",
  ];
}

/**
 * members シートの指定メンバーの設定（lang, bgMode, bgColor）を RAW で更新する（F11 / S5）。
 */
export async function updateMemberSettings(
  spreadsheetId: string,
  memberId: string,
  updates: { lang?: "ja" | "en"; bgMode?: string; bgColor?: string }
): Promise<void> {
  const auth = getGoogleAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "members!A:Z",
  });

  const rows = (res.data.values as string[][]) || [];
  if (rows.length <= 1) {
    throw new Error("members sheet is empty or headers missing");
  }

  const headers = rows[0].map((h) => String(h).trim());
  const memberIdIdx = headers.indexOf("member_id");
  if (memberIdIdx === -1) {
    throw new Error("member_id column not found in members sheet");
  }

  const langIdx = headers.indexOf("lang");
  const bgModeIdx = headers.indexOf("bg_mode");
  const bgColorIdx = headers.indexOf("bg_color");

  for (let idx = 1; idx < rows.length; idx++) {
    const row = rows[idx];
    if (String(row[memberIdIdx] || "").trim() === memberId) {
      // 該当行を発見（行番号は 1 始まりで idx + 1）
      const newRow = [...row];
      while (newRow.length < headers.length) {
        newRow.push("");
      }

      if (updates.lang !== undefined && langIdx !== -1) {
        newRow[langIdx] = updates.lang === "en" ? "en" : "ja";
      }
      if (updates.bgMode !== undefined && bgModeIdx !== -1) {
        newRow[bgModeIdx] = ["standard", "color", "bing"].includes(updates.bgMode)
          ? updates.bgMode
          : "standard";
      }
      if (updates.bgColor !== undefined && bgColorIdx !== -1) {
        newRow[bgColorIdx] = updates.bgColor || "standard";
      }

      await updateSheetRow(spreadsheetId, "members", idx + 1, newRow);
      return;
    }
  }

  throw new Error(`Member with ID "${memberId}" not found in members sheet`);
}
