import { google } from "googleapis";
import { getGoogleAuth } from "./google/auth";
import { appendSheetRow, updateSheetRow } from "./google/sheets";
import { Checkin } from "./schemas/checkins";

export function checkinToRow(c: Checkin): string[] {
  return [
    c.checkinId,
    c.memberId,
    c.date,
    String(c.score),
    c.comment || "",
    c.autoLoadAtCheckin !== null && c.autoLoadAtCheckin !== undefined
      ? String(c.autoLoadAtCheckin)
      : "0",
  ];
}

/**
 * 体感負荷チェックインを保存する（4.5・F16）。
 * 同じメンバーが同じ日にすでに回答済みの場合は、既存行を上書きする。
 * 未回答の場合は末尾に行を追加する。
 * 全ての書き込みは S5（valueInputOption: "RAW"）で行われる。
 */
export async function saveCheckin(
  spreadsheetId: string,
  checkin: Checkin
): Promise<Checkin> {
  const auth = getGoogleAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "checkins!A:Z",
  });

  const rows = (res.data.values as string[][]) || [];
  if (rows.length > 0) {
    const headers = rows[0].map((h) => String(h).trim());
    const memberIdIdx = headers.indexOf("member_id");
    const dateIdx = headers.indexOf("date");

    if (memberIdIdx !== -1 && dateIdx !== -1) {
      for (let idx = 1; idx < rows.length; idx++) {
        const row = rows[idx];
        const rMemberId = String(row[memberIdIdx] || "").trim();
        const rDate = String(row[dateIdx] || "").trim();

        if (rMemberId === checkin.memberId && rDate === checkin.date) {
          // 同日の既存回答を発見 -> 行番号 idx + 1 (1-indexed) を上書き
          await updateSheetRow(
            spreadsheetId,
            "checkins",
            idx + 1,
            checkinToRow(checkin)
          );
          return checkin;
        }
      }
    }
  }

  // 同日回答が存在しない場合は行追加
  await appendSheetRow(spreadsheetId, "checkins", checkinToRow(checkin));
  return checkin;
}
