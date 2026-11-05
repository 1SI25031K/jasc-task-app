import { z } from "zod";

export const DAILY_SNAPSHOT_HEADER_MAP = {
  date: "date",
  scope_type: "scopeType",
  scope_id: "scopeId",
  total: "total",
  done: "done",
  open: "open",
  overdue: "overdue",
  completion_rate: "completionRate",
  auto_load: "autoLoad",
} as const;

export const DailySnapshotSchema = z.object({
  date: z.string({ required_error: "date is required" }).min(1, "date is required"),
  scopeType: z.string().default("ALL"),
  scopeId: z.string().default(""),
  total: z.coerce.number().default(0),
  done: z.coerce.number().default(0),
  open: z.coerce.number().default(0),
  overdue: z.coerce.number().default(0),
  completionRate: z.coerce.number().default(0),
  autoLoad: z.coerce.number().default(0),
});

export type DailySnapshot = z.infer<typeof DailySnapshotSchema>;
