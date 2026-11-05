import { z } from "zod";

export const MEMBER_HEADER_MAP = {
  member_id: "memberId",
  display_name: "displayName",
  display_name_en: "displayNameEn",
  email: "email",
  main_roles: "mainRoles",
  lang: "lang",
  slack_user_id: "slackUserId",
  reminders_enabled: "remindersEnabled",
  is_admin: "isAdmin",
  active: "active",
  bg_mode: "bgMode",
  bg_color: "bgColor",
} as const;

export const MemberSchema = z.object({
  memberId: z.string({ required_error: "member_id is required" }).min(1, "member_id is required"),
  displayName: z.string({ required_error: "display_name is required" }).min(1, "display_name is required"),
  displayNameEn: z.string().default(""),
  email: z.string().default(""),
  mainRoles: z.string().default(""),
  lang: z.enum(["ja", "en"]).default("ja"),
  slackUserId: z.string().default(""),
  remindersEnabled: z.boolean().default(false),
  isAdmin: z.boolean().default(false),
  active: z.boolean().default(true),
  bgMode: z.string().default("none"),
  bgColor: z.string().default(""),
});

export type Member = z.infer<typeof MemberSchema>;
