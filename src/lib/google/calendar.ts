import { google } from "googleapis";
import { getGoogleAuth } from "./auth";

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  meetingLink: string | null;
  minutesLink: string | null;
  description: string | null;
}

/**
 * EC 共有カレンダーから直近 14 日間の予定を取得する (Phase 5 向け)
 */
export async function getUpcomingCalendarEvents(
  calendarId: string | undefined = process.env.GOOGLE_CALENDAR_ID
): Promise<CalendarEvent[]> {
  if (!calendarId) {
    return [];
  }

  const auth = getGoogleAuth();
  const calendar = google.calendar({ version: "v3", auth });

  const now = new Date();
  const twoWeeksLater = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  try {
    const res = await calendar.events.list({
      calendarId,
      timeMin: now.toISOString(),
      timeMax: twoWeeksLater.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    });

    const items = res.data.items || [];
    return items.map((item) => {
      // 会議リンク（Google Meet または Zoom URL）
      let meetingLink: string | null = item.hangoutLink || null;
      if (!meetingLink && item.description) {
        const urlMatch = item.description.match(/https?:\/\/[^\s]+/);
        if (urlMatch) meetingLink = urlMatch[0];
      }

      // 議事録リンク（Docs / Notion などの URL）
      let minutesLink: string | null = null;
      if (item.description) {
        const docsMatch = item.description.match(/https?:\/\/(?:docs\.google\.com|notion\.so)[^\s]+/);
        if (docsMatch) minutesLink = docsMatch[0];
      }

      return {
        id: item.id || "",
        title: item.summary || "(タイトルなし)",
        start: item.start?.dateTime || item.start?.date || "",
        end: item.end?.dateTime || item.end?.date || "",
        meetingLink,
        minutesLink,
        description: item.description || null,
      };
    });
  } catch (error: any) {
    console.warn(`[Google Calendar] Failed to fetch events:`, error?.message || error);
    return [];
  }
}

