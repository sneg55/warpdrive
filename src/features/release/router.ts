import { env } from "@/config/env";
import { protectedProcedure, router } from "@/server/trpc/trpc";
import { computeStatus } from "./computeStatus";
import { getCurrentVersion } from "./currentVersion";
import { readReleaseStatus } from "./releaseStatus";

export const versionRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const row = await readReleaseStatus(ctx.db);
    return computeStatus(getCurrentVersion(), row, env.DISABLE_UPDATE_CHECK);
  }),
});
