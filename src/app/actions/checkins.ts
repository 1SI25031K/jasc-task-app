"use server";

import { revalidatePath } from "next/cache";
import { requireActiveMember } from "@/lib/server-guard";
import { fetchDashboardData } from "@/lib/data";
import { calcMemberAutoLoad } from "@/lib/services";
import { getTodayJST } from "@/lib/time";
import { saveCheckin } from "@/lib/checkins-repo";
import { Checkin } from "@/lib/schemas/checkins";

export type SaveCheckinResult =
  | {
      success: true;
      score: number;
      prevScore: number | null;
      autoPt: number;
    }
  | {
      success: false;
      error: string;
    };

/**
 * 体感負荷チェックインを送信する（F16・4.5）。
 * - S1: サーバー側で active なメンバーのみ許可
 * - S5: RAW 入力で保存
 * - 同日の回答は上書き、過去回答との比較情報を返却
 */
export async function saveCheckinAction(
  score: number,
  comment?: string
): Promise<SaveCheckinResult> {
  try {
    const auth = await requireActiveMember();
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    if (!spreadsheetId) {
      return { success: false, error: "GOOGLE_SPREADSHEET_ID is not configured" };
    }

    const intScore = Math.round(score);
    if (isNaN(intScore) || intScore < 1 || intScore > 10) {
      return { success: false, error: "スコアは 1 から 10 の間で指定してください。" };
    }

    const cleanComment = (comment || "").trim().slice(0, 100);

    const data = await fetchDashboardData();
    const today = getTodayJST();
    const autoPt = calcMemberAutoLoad(auth.member.memberId, data.tasks, today);

    // 過去の最新回答（今日より前）を取得
    const pastCheckins = data.checkins
      .filter((c: Checkin) => c.memberId === auth.member.memberId && c.date < today)
      .sort((a: Checkin, b: Checkin) => b.date.localeCompare(a.date));
    const prevScore = pastCheckins.length > 0 ? pastCheckins[0].score : null;

    const checkinId = `c_${Math.random().toString(36).substring(2, 8)}`;
    const newCheckin: Checkin = {
      checkinId,
      memberId: auth.member.memberId,
      date: today,
      score: intScore,
      comment: cleanComment,
      autoLoadAtCheckin: autoPt,
    };

    await saveCheckin(spreadsheetId, newCheckin);

    revalidatePath("/");
    revalidatePath("/checkin");
    revalidatePath("/capacity");

    return {
      success: true,
      score: intScore,
      prevScore,
      autoPt,
    };
  } catch (err: any) {
    console.error("Failed to save checkin:", err);
    return {
      success: false,
      error: err.message || "チェックインの保存に失敗しました。",
    };
  }
}
