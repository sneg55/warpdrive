import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { ERROR_IDS } from "@/constants/errorIds";
import { FILE_ENTITY_TYPE } from "@/constants/fileEntityTypes";
import { protectedProcedure, router } from "@/server/trpc/trpc";
import { canActorAccessParent } from "./fileAuthz";
import { listFilesForEntity } from "./listFilesForEntity";

const listInput = z.object({
  entityType: z.enum(FILE_ENTITY_TYPE),
  entityId: z.string().uuid(),
});

// Files inherit their parent entity's visibility. listFilesForEntity is a plain
// index read that does NOT gate; the router gates the parent first (reusing the
// existing fileAuthz dispatcher, which fails closed) and throws NOT_FOUND when the
// parent is invisible, so a caller never learns another entity's attachments exist.
export const filesRouter = router({
  listForEntity: protectedProcedure.input(listInput).query(async ({ ctx, input }) => {
    const signal = AbortSignal.timeout(10_000);
    const allowed = await canActorAccessParent(
      ctx.db,
      ctx.actor,
      input.entityType,
      input.entityId,
      signal,
    );
    if (!allowed) {
      throw new TRPCError({ code: "NOT_FOUND", message: ERROR_IDS.PERM_DENIED });
    }
    return listFilesForEntity(ctx.db, input.entityType, input.entityId, signal);
  }),
});
