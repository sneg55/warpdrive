import type { AppError } from "@/constants/errorIds";
import { db } from "@/db/client";
import type { GmailClient } from "@/features/email/gmailClient";
import { createGmailClient } from "@/features/email/gmailClient";
import { makeRefresh } from "@/features/email/gmailRefresh";
import { sweepAllMailboxes } from "@/features/email/spamSweepAll";
import { ensureAccessToken } from "@/features/email/tokens";
import { ok, type Result } from "@/types/result";

async function resolveClient(
  accountId: string,
  signal: AbortSignal,
): Promise<Result<GmailClient, AppError>> {
  const token = await ensureAccessToken(db, {
    accountId,
    deps: { refresh: makeRefresh(signal) },
  });
  if (!token.ok) return token;
  return ok(createGmailClient(token.value.token));
}

async function main(): Promise<void> {
  const controller = new AbortController();
  const results = await sweepAllMailboxes(db, { resolveClient }, controller.signal);

  if (results.length === 0) {
    console.warn("no connected mailboxes, nothing to sweep");
    return;
  }
  for (const r of results) {
    if (r.ok) console.warn(`${r.email}: ${r.hidden} spam conversation(s) hidden`);
    else console.error(`${r.email}: sweep failed (${r.errorId ?? "unknown"})`);
  }
  if (results.some((r) => !r.ok)) process.exitCode = 1;
}

await main();
