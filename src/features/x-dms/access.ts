import { type SQL, sql } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";

export const memberOf = (actorId: string, accountColumn: SQL): SQL =>
  sql`EXISTS (SELECT 1 FROM x_account_members m
    WHERE m.account_id = ${accountColumn} AND m.user_id = ${actorId}::uuid)`;

export const xAccountNotFound = (context: Record<string, unknown> = {}): AppError =>
  new AppError(ERROR_IDS.X_ACCOUNT_NOT_FOUND, "X account not found", context);

export async function isXMember(
  db: Db,
  args: { actorId: string; accountId: string },
  signal: AbortSignal,
): Promise<boolean> {
  signal.throwIfAborted();
  const rows = await db.execute(sql`SELECT 1 FROM x_account_members
    WHERE account_id = ${args.accountId}::uuid AND user_id = ${args.actorId}::uuid`);
  signal.throwIfAborted();
  return rows.rows.length > 0;
}
