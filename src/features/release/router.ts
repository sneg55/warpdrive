import { env } from "@/config/env";
import { protectedProcedure, router } from "@/server/trpc/trpc";
import { computeStatus } from "./computeStatus";
import { getCurrentVersion } from "./currentVersion";
import { readReleaseStatus } from "./releaseStatus";

// Pure read of the cached release row. The cron job (worker) is what refreshes it; this never
// fetches GitHub itself. The banner is admin-gated at the app-shell mount, so only admins issue it.
export const versionRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const row = await readReleaseStatus(ctx.db);
    return computeStatus(getCurrentVersion(), row, env.DISABLE_UPDATE_CHECK);
  }),
});
