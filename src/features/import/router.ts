import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { ERROR_IDS } from "@/constants/errorIds";
import { can } from "@/features/permissions/can";
import { protectedProcedure, router } from "@/server/trpc/trpc";
import { unwrap } from "@/server/unwrap";
import { getBatch, listRows } from "./batch";
import { toImportActor } from "./importActor";
import { getBatchResult, listBatches } from "./results";

// Every import read requires data.import, not just authentication: listRows exposes raw CSV
// row data, so a user whose data.import was revoked must not keep reading batches.
const importProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!can(ctx.actor, "data.import")) {
    throw new TRPCError({ code: "FORBIDDEN", message: ERROR_IDS.PERM_DENIED });
  }
  return next();
});

export const importRouter = router({
  listBatches: importProcedure.query(({ ctx }) =>
    unwrap(listBatches(ctx.db, toImportActor(ctx.actor), AbortSignal.timeout(10_000))),
  ),

  getResult: importProcedure
    .input(z.object({ batchId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      unwrap(
        getBatchResult(
          ctx.db,
          toImportActor(ctx.actor),
          input.batchId,
          AbortSignal.timeout(10_000),
        ),
      ),
    ),

  getBatch: importProcedure
    .input(z.object({ batchId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      unwrap(
        getBatch(ctx.db, toImportActor(ctx.actor), input.batchId, AbortSignal.timeout(10_000)),
      ),
    ),

  listRows: importProcedure
    .input(z.object({ batchId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      unwrap(
        listRows(ctx.db, toImportActor(ctx.actor), input.batchId, AbortSignal.timeout(10_000)),
      ),
    ),
});
