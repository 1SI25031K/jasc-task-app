import { z } from "zod";

export const ROLE_HEADER_MAP = {
  role_id: "roleId",
  name: "name",
  name_en: "nameEn",
  category: "category",
  sort_order: "sortOrder",
  active: "active",
} as const;

export const RoleSchema = z.object({
  roleId: z.string({ required_error: "role_id is required" }).min(1, "role_id is required"),
  name: z.string({ required_error: "name is required" }).min(1, "name is required"),
  nameEn: z.string().default(""),
  category: z.string().default("その他"),
  sortOrder: z.coerce.number().default(999),
  active: z.boolean().default(true),
});

export type Role = z.infer<typeof RoleSchema>;
