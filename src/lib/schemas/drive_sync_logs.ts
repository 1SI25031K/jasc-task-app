import { z } from "zod";

export const DRIVE_SYNC_LOG_HEADER_MAP = {
  file_id: "fileId",
  file_name: "fileName",
  mime_type: "mimeType",
  drive_modified_time: "driveModifiedTime",
  gemini_file_resource_name: "geminiFileResourceName",
  status: "status",
  drive_link: "driveLink",
  last_synced_at: "lastSyncedAt",
  error_message: "errorMessage",
} as const;

export const DriveSyncLogSchema = z.object({
  fileId: z.string().default(""),
  fileName: z.string().default(""),
  mimeType: z.string().default(""),
  driveModifiedTime: z.string().default(""),
  geminiFileResourceName: z.string().default(""),
  status: z.string().default(""),
  driveLink: z.string().default(""),
  lastSyncedAt: z.string().default(""),
  errorMessage: z.string().default(""),
});

export type DriveSyncLog = z.infer<typeof DriveSyncLogSchema>;

