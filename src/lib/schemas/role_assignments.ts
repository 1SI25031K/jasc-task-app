import { z } from "zod";

export const ROLE_ASSIGNMENT_HEADER_MAP = {
  role_id: "roleId",
  member_id: "memberId",
  kind: "kind",
} as const;

export const RoleAssignmentSchema = z.object({
  roleId: z.string({ required_error: "role_id is required" }).min(1, "role_id is required"),
  memberId: z.string({ required_error: "member_id is required" }).min(1, "member_id is required"),
  kind: z.string().default("担当"),
});

export type RoleAssignment = z.infer<typeof RoleAssignmentSchema>;
