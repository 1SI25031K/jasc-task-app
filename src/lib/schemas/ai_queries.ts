import { z } from "zod";

export const AI_QUERY_HEADER_MAP = {
  query_id: "queryId",
  timestamp: "timestamp",
  member_id: "memberId",
  query_text: "queryText",
  grounded_task_ids: "groundedTaskIds",
  status: "status",
  error_message: "errorMessage",
} as const;

export const AiQuerySchema = z.object({
  queryId: z.string().default(""),
  timestamp: z.string().default(""),
  memberId: z.string().default(""),
  queryText: z.string().default(""),
  groundedTaskIds: z.string().default(""),
  status: z.string().default(""),
  errorMessage: z.string().default(""),
});

export type AiQuery = z.infer<typeof AiQuerySchema>;
