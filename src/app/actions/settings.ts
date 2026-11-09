"use server";

import { requireActiveMember } from "@/lib/server-guard";
import { updateMemberSettings } from "@/lib/members-repo";
import { revalidatePath } from "next/cache";

export async function updateMemberSettingsAction(params: {
  lang?: "ja" | "en";
  bgMode?: string;
  bgColor?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { member } = await requireActiveMember();
    const spreadsheetId = process.env.SPREADSHEET_ID;
    if (!spreadsheetId) {
      throw new Error("SPREADSHEET_ID is not configured");
    }

    await updateMemberSettings(spreadsheetId, member.memberId, params);
    revalidatePath("/", "layout");
    return { success: true };
  } catch (error: any) {
    console.error("[updateMemberSettingsAction] failed:", error);
    return {
      success: false,
      error: error?.message || "設定の保存に失敗しました",
    };
  }
}
