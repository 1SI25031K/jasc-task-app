import { google } from "googleapis";

const READONLY_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
];

/**
 * Google API 認証クライアントを取得する。
 * - 環境変数 GOOGLE_SERVICE_ACCOUNT_EMAIL & GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY がある場合: サービスアカウント認証
 * - ない場合 (Google Cloud Run 等の本番環境): デフォルトの IAM サービスアカウント (ADC) を自動利用
 * ※ 権限は readonly に厳格に限定
 */
export function getGoogleAuth() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (clientEmail && privateKey) {
    // 改行文字のエスケープ解除
    if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
      privateKey = privateKey.slice(1, -1);
    }
    privateKey = privateKey.replace(/\\n/g, "\n");

    return new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: READONLY_SCOPES,
    });
  }

  // Cloud Run または ADC
  return new google.auth.GoogleAuth({
    scopes: READONLY_SCOPES,
  });
}

