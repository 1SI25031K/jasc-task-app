import { google } from "googleapis";
import { getGoogleAuth } from "./auth";

/**
 * 指数バックオフ付き非同期待機
 */
async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Google Sheets API の batchGet を実行し、全指定シートのデータを 1 回の HTTP リクエストで取得する。
 * 429（Rate Limit）や 503 等のサーバーエラー時は指数バックオフで最大 3 回リトライする。
 */
export async function batchGetSheetValues(
  spreadsheetId: string,
  sheetNames: string[],
  maxRetries = 3
): Promise<Record<string, string[][]>> {
  const auth = getGoogleAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const ranges = sheetNames.map((name) => `${name}!A:Z`);

  let attempt = 0;
  let delay = 1000;

  while (attempt <= maxRetries) {
    try {
      const res = await sheets.spreadsheets.values.batchGet({
        spreadsheetId,
        ranges,
        valueRenderOption: "FORMATTED_VALUE",
        dateTimeRenderOption: "FORMATTED_STRING",
      });

      const valueRanges = res.data.valueRanges || [];
      const result: Record<string, string[][]> = {};

      for (let i = 0; i < sheetNames.length; i++) {
        const sheetName = sheetNames[i];
        const rows = (valueRanges[i]?.values as string[][]) || [];
        result[sheetName] = rows;
      }

      return result;
    } catch (error: any) {
      attempt++;
      const status = error?.status || error?.response?.status;

      // 429 (Rate Limit) または 5xx サーバーエラーの時はリトライ
      if ((status === 429 || (status >= 500 && status < 600)) && attempt <= maxRetries) {
        console.warn(`[Google Sheets] ${status} error, retrying attempt ${attempt}/${maxRetries} in ${delay}ms...`);
        await sleep(delay);
        delay *= 2;
        continue;
      }

      console.error(`[Google Sheets] batchGet failed:`, error?.message || error);
      throw error;
    }
  }

  throw new Error(`Failed to batchGet sheets after ${maxRetries} retries`);
}

