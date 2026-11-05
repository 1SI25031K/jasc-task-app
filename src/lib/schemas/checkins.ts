import { z } from "zod";

export const CHECKIN_HEADER_MAP = {
  checkin_id: "checkinId",
  member_id: "memberId",
  date: "date",
  score: "score",
  comment: "comment",
  auto_load_at_checkin: "autoLoadAtCheckin",
} as const;

export const CheckinSchema = z.object({
  checkinId: z.string({ required_error: "checkin_id is required" }).min(1, "checkin_id is required"),
  memberId: z.string({ required_error: "member_id is required" }).min(1, "member_id is required"),
  date: z.string().default(""),
  score: z.coerce.number().min(1).max(10).default(5),
  comment: z.string().default(""),
  autoLoadAtCheckin: z.coerce.number().nullable().default(null),
});

export type Checkin = z.infer<typeof CheckinSchema>;
