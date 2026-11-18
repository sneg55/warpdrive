import { sql } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { err, ok, type Result } from "@/types/result";
import { createAgenticClient } from "./provider/agenticClient";
import { encryptAgenticCredentials } from "./provider/agenticCredentials";
import { assertTeamMailboxAdmin } from "./teamMailboxConnect";

export interface AgenticEnqueue {
  sync: (accountId: string) => Promise<void>;
  backfill: (accountId: string) => Promise<void>;
}

export interface ConnectAgenticArgs {
  enabled: boolean;
  actorId: string;
  baseUrl: string;
  address: string;
  clientId: string;
  clientSecret: string;
  displayName: string;
  backfillDays: number;
}

export interface ReconnectAgenticArgs {
  enabled: boolean;
  actorId: string;
  accountId: string;
  clientId: string;
  clientSecret: string;
}

function denied(message: string): Result<never, AppError> {
  return err(new AppError(ERROR_IDS.PERM_DENIED, message, {}));
}

async function validateAgentic(
  cfg: { baseUrl: string; mailbox: string; clientId: string; clientSecret: string },
  signal: AbortSignal,
): Promise<Result<void, AppError>> {
  const client = createAgenticClient(cfg);
  const capabilities = await client.capabilities(signal);
  signal.throwIfAborted();
  if (!capabilities.ok) return capabilities;
  const mailbox = await client.getMailbox(signal);
  signal.throwIfAborted();
  return mailbox.ok ? ok(undefined) : mailbox;
}

async function startWork(
  enqueue: AgenticEnqueue,
  accountId: string,
  backfill: boolean,
): Promise<void> {
  try {
    await enqueue.sync(accountId);
    if (backfill) await enqueue.backfill(accountId);
  } catch (e) {
    console.error("[agentic connect] enqueue failed:", e instanceof Error ? e.name : "unknown");
  }
}

export async function connectAgenticMailbox(
  db: Db,
  args: ConnectAgenticArgs,
  enqueue: AgenticEnqueue,
  signal: AbortSignal,
): Promise<Result<{ accountId: string }, AppError>> {
  if (!args.enabled) return denied("agentic inbox is not enabled");
  const allowed = await assertTeamMailboxAdmin(db, args.actorId, signal);
  if (!allowed.ok) return allowed;
  const address = args.address.trim().toLowerCase();
  const taken = await db.execute(sql`SELECT 1 FROM email_accounts WHERE email_address=${address}`);
  signal.throwIfAborted();
  const collision = err(
    new AppError(ERROR_IDS.GMAIL_TEAM_MAILBOX_PERSONAL_COLLISION, "address already in use", {}),
  );
  if (taken.rows.length > 0) return collision;
  const valid = await validateAgentic({ ...args, mailbox: address }, signal);
  if (!valid.ok) return valid;
  const backfillDays = args.backfillDays > 0 ? args.backfillDays : null;
  const credentials = encryptAgenticCredentials(args);
  const row = await db.transaction(async (tx) => {
    const inserted = await tx.execute(sql`
      INSERT INTO email_accounts (kind, email_address, display_name, connected_by_user_id, backfill_days,
        provider, provider_base_url, provider_credentials_enc)
      VALUES ('team', ${address}, ${args.displayName}, ${args.actorId}, ${backfillDays},
        'agentic_inbox', ${args.baseUrl}, ${credentials})
      ON CONFLICT (email_address) DO NOTHING RETURNING id
    `);
    const account = inserted.rows[0] as { id: string } | undefined;
    if (account === undefined) return undefined;
    await tx.execute(
      sql`INSERT INTO email_account_members (account_id, user_id) VALUES (${account.id}, ${args.actorId}) ON CONFLICT DO NOTHING`,
    );
    return account;
  });
  signal.throwIfAborted();
  if (row === undefined) return collision;
  await startWork(enqueue, row.id, backfillDays !== null);
  return ok({ accountId: row.id });
}

export async function reconnectAgenticMailbox(
  db: Db,
  args: ReconnectAgenticArgs,
  enqueue: AgenticEnqueue,
  signal: AbortSignal,
): Promise<Result<{ accountId: string }, AppError>> {
  if (!args.enabled) return denied("agentic inbox is not enabled");
  const allowed = await assertTeamMailboxAdmin(db, args.actorId, signal);
  if (!allowed.ok) return allowed;
  const rows = await db.execute(sql`SELECT email_address, provider_base_url FROM email_accounts
    WHERE id=${args.accountId} AND kind='team' AND provider='agentic_inbox'`);
  signal.throwIfAborted();
  const row = rows.rows[0] as
    | { email_address: string; provider_base_url: string | null }
    | undefined;
  if (row === undefined || row.provider_base_url === null) {
    return err(new AppError(ERROR_IDS.AINBOX_MAILBOX_NOT_FOUND, "agentic mailbox not found", {}));
  }
  const valid = await validateAgentic(
    {
      baseUrl: row.provider_base_url,
      mailbox: row.email_address,
      clientId: args.clientId,
      clientSecret: args.clientSecret,
    },
    signal,
  );
  if (!valid.ok) return valid;
  await db.execute(sql`UPDATE email_accounts
    SET provider_credentials_enc=${encryptAgenticCredentials(args)}, status='connected',
      last_error_id=NULL, updated_at=now()
    WHERE id=${args.accountId}`);
  signal.throwIfAborted();
  await startWork(enqueue, args.accountId, false);
  return ok({ accountId: args.accountId });
}
