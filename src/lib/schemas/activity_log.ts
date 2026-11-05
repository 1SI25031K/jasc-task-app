import { z } from "zod";

export const ACTIVITY_LOG_HEADER_MAP = {
  timestamp: "timestamp",
  member_id: "memberId",
  task_id: "taskId",
  action: "action",
  field: "field",
  old_value: "oldValue",
  new_value: "newValue",
} as const;

export const ActivityLogSchema = z.object({
  timestamp: z.string().default(""),
  memberId: z.string().default(""),
  taskId: z.string().default(""),
  action: z.string().default(""),
  field: z.string().default(""),
  oldValue: z.string().default(""),
  newValue: z.string().default(""),
});

export type ActivityLog = z.infer<typeof ActivityLogSchema>;

