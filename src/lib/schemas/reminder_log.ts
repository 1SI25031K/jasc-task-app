import { z } from "zod";

export const REMINDER_LOG_HEADER_MAP = {
  sent_at: "sentAt",
  member_id: "memberId",
  kind: "kind",
  task_id: "taskId",
  date_key: "dateKey",
} as const;

export const ReminderLogSchema = z.object({
  sentAt: z.string().default(""),
  memberId: z.string().default(""),
  kind: z.string().default(""),
  taskId: z.string().default(""),
  dateKey: z.string().default(""),
});

export type ReminderLog = z.infer<typeof ReminderLogSchema>;

