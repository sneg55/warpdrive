import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { PERMISSION_FLAGS } from "@/constants/permissionFlags";
import { listPermissionSets } from "@/features/identity/permission-sets.service";
import { listTeams } from "@/features/identity/teams.service";
import { listAssignableUsers, listUsers } from "@/features/identity/users.service";
import {
  listGroupMembers,
  listVisibilityGroups,
} from "@/features/identity/visibility-groups.service";
import { protectedProcedure, router } from "../trpc";

function requireManage(actor: { type: string; flags: ReadonlySet<string> }): void {
  if (actor.type !== "admin" && !actor.flags.has(PERMISSION_FLAGS.MANAGE)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "E_PERM_001" });
  }
}

export const identityRouter = router({
  listUsers: protectedProcedure.query(({ ctx }) => {
    requireManage(ctx.actor);
    return listUsers(ctx.db, AbortSignal.timeout(5000));
  }),
  // Ungated on purpose: an owner/assignee picker needs the full active-user list.
  // The owner-change write paths keep their gates + active-check.
  assignableUsers: protectedProcedure.query(({ ctx }) =>
    listAssignableUsers(ctx.db, AbortSignal.timeout(5000)),
  ),
  listPermissionSets: protectedProcedure.query(({ ctx }) => {
    requireManage(ctx.actor);
    return listPermissionSets(ctx.db, AbortSignal.timeout(5000));
  }),
  listVisibilityGroups: protectedProcedure.query(({ ctx }) => {
    requireManage(ctx.actor);
    return listVisibilityGroups(ctx.db, AbortSignal.timeout(5000));
  }),
  // listGroupMembers gates itself (permissions.manage/admin); unwrap its Result here
  // rather than gating twice at the router.
  groupMembers: protectedProcedure
    .input(z.object({ groupId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const result = await listGroupMembers(
        ctx.db,
        ctx.actor,
        input.groupId,
        AbortSignal.timeout(5000),
      );
      if (!result.ok) {
        throw new TRPCError({ code: "FORBIDDEN", message: result.error });
      }
      return result.value;
    }),
  listTeams: protectedProcedure.query(({ ctx }) => {
    requireManage(ctx.actor);
    return listTeams(ctx.db, AbortSignal.timeout(5000));
  }),
});
