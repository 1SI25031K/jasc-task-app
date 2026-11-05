import { z } from "zod";

export const SETTING_HEADER_MAP = {
  key: "key",
  value: "value",
} as const;

export const SettingSchema = z.object({
  key: z.string({ required_error: "key is required" }).min(1, "key is required"),
  value: z.string().default(""),
});

export type Setting = z.infer<typeof SettingSchema>;
