import { z } from "zod";
import { permissionFlagsSchema } from "@/features/permissions/schemas";

export const createPermissionSetInput = z.object({
  name: z.string().min(1).max(80),
  flags: permissionFlagsSchema.default({}),
});

export const updateFlagsInput = z.object({
  setId: z.string().uuid(),
  flags: permissionFlagsSchema,
});

export const createGroupInput = z.object({ name: z.string().min(1).max(80) });
export const groupMemberInput = z.object({
  groupId: z.string().uuid(),
  userId: z.string().uuid(),
});

export const createTeamInput = z.object({
  name: z.string().min(1).max(80),
  managerId: z.string().uuid().nullable().default(null),
});
export const setTeamMembersInput = z.object({
  teamId: z.string().uuid(),
  userIds: z.array(z.string().uuid()),
});
export const updateTeamInput = z.object({
  teamId: z.string().uuid(),
  name: z.string().min(1).max(80),
  managerId: z.string().uuid().nullable().default(null),
});
export const deleteTeamInput = z.object({
  teamId: z.string().uuid(),
});

export const assignSetInput = z.object({
  userId: z.string().uuid(),
  setId: z.string().uuid(),
});
export const setAdminInput = z.object({
  userId: z.string().uuid(),
  isAdmin: z.boolean(),
});
export const setActiveInput = z.object({
  userId: z.string().uuid(),
  isActive: z.boolean(),
});

export const inviteUserInput = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  isAdmin: z.boolean(),
});
