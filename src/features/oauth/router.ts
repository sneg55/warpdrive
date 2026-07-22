import { and, desc, eq, gt, isNull, max, min } from "drizzle-orm";
import type { Db } from "@/db/client";
import { oauthAccessTokens, oauthClients } from "@/db/schema";
import { protectedProcedure, router } from "@/server/trpc/trpc";

export async function listConnections(db: Db, userId: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const rows = await db
    .select({
      clientId: oauthClients.id,
      clientName: oauthClients.name,
      connectedAt: min(oauthAccessTokens.issuedAt),
      lastUsedAt: max(oauthAccessTokens.lastUsedAt),
    })
    .from(oauthAccessTokens)
    .innerJoin(oauthClients, eq(oauthClients.id, oauthAccessTokens.clientId))
    .where(
      and(
        eq(oauthAccessTokens.userId, userId),
        isNull(oauthAccessTokens.revokedAt),
        gt(oauthAccessTokens.expiresAt, new Date()),
      ),
    )
    .groupBy(oauthClients.id, oauthClients.name)
    .orderBy(desc(min(oauthAccessTokens.issuedAt)));
  signal.throwIfAborted();
  return rows;
}

export const oauthRouter = router({
  listConnections: protectedProcedure.query(({ ctx }) =>
    listConnections(ctx.db, ctx.actor.id, AbortSignal.timeout(10_000)),
  ),
});
