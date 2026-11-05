import { z } from "zod";

export const MEETING_HEADER_MAP = {
  meeting_id: "meetingId",
  meeting_date: "meetingDate",
  title: "title",
  created_by: "createdBy",
  created_at: "createdAt",
  generated_count: "generatedCount",
  saved_count: "savedCount",
} as const;

export const MeetingSchema = z.object({
  meetingId: z.string({ required_error: "meeting_id is required" }).min(1, "meeting_id is required"),
  meetingDate: z.string().default(""),
  title: z.string().default(""),
  createdBy: z.string().default(""),
  createdAt: z.string().default(""),
  generatedCount: z.coerce.number().default(0),
  savedCount: z.coerce.number().default(0),
});

export type Meeting = z.infer<typeof MeetingSchema>;
