import { appendSheetRow } from "./google/sheets";
import { Meeting } from "./schemas/meetings";

export function meetingToRow(mtg: Meeting): string[] {
  return [
    mtg.meetingId,
    mtg.meetingDate,
    mtg.title,
    mtg.createdBy,
    mtg.createdAt,
    String(mtg.generatedCount),
    String(mtg.savedCount),
  ];
}

/**
 * meetings シートに行を追加する（S5: valueInputOption="RAW"）。
 */
export async function appendMeeting(
  spreadsheetId: string,
  meeting: Meeting
): Promise<void> {
  await appendSheetRow(spreadsheetId, "meetings", meetingToRow(meeting));
}
