import { sql } from "drizzle-orm";
import { env } from "@/config/env";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { err, ok, type Result } from "@/types/result";
import { deriveMessageId } from "./mime";
import type { SendPayload } from "./outboxClaim";

export async function enqueueSend(
  db: Db,
  args: {
    accountId: string;
    idempotencyKey: string;
    payload: SendPayload;
    threadId?: string | null;
    scheduledAt?: Date | null;
  },
  signal: AbortSignal,
): Promise<Result<{ attemptId: string; replay: boolean }, AppError>> {
  signal.throwIfAborted();
  const header = deriveMessageId({
    accountId: args.accountId,
    idempotencyKey: args.idempotencyKey,
    domain: env.GOOGLE_WORKSPACE_DOMAIN,
  });
  await db.execute(sql`
    INSERT INTO email_send_attempts (idempotency_key, message_id_header, account_id, thread_id, payload, status, scheduled_at)
    VALUES (${args.idempotencyKey}, ${header}, ${args.accountId}, ${args.threadId ?? null}, ${JSON.stringify(args.payload)}::jsonb, 'pending', ${args.scheduledAt ?? null})
    ON CONFLICT (account_id, idempotency_key) DO NOTHING
  `);

  signal.throwIfAborted();
  const row = (
    await db.execute(sql`
      SELECT id, status, payload->>'actorId' AS actor_id FROM email_send_attempts
      WHERE account_id=${args.accountId} AND idempotency_key=${args.idempotencyKey}
    `)
  ).rows[0] as { id: string; status: string; actor_id: string | null } | undefined;
  signal.throwIfAborted();
  if (row === undefined) {
    return err(new AppError("E_DB_002", "enqueueSend found no attempt row", args));
  }
  if (row.actor_id !== null && row.actor_id !== args.payload.actorId) {
    return err(
      new AppError(
        ERROR_IDS.PERM_SEND_AUTHOR_REQUIRED,
        "send attempt belongs to another author",
        {},
      ),
    );
  }
  return ok({ attemptId: row.id, replay: row.status === "sent" });
}
