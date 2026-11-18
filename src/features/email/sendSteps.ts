import type { AppError } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { ok, type Result } from "@/types/result";
import { assertMailboxOwner } from "./mailboxOwnership";
import type { SendOutcome } from "./outboxReconcile";
import { checkRecipientLimit, type SendEmailInput } from "./sendInput";
import { disableTokens } from "./tracking";

const TERMINAL_UNSENT: readonly SendOutcome["status"][] = ["failed", "needs_review"];

export async function senderAddress(
  db: Db,
  input: SendEmailInput,
  actorId: string,
  signal: AbortSignal,
): Promise<Result<string, AppError>> {
  const acct = await assertMailboxOwner(db, input.accountId, actorId, signal);
  if (!acct.ok) return acct;
  const limit = checkRecipientLimit(acct.value.provider, input);
  if (!limit.ok) return limit;
  return ok(acct.value.emailAddress);
}

export async function disableUnsentTokens(
  db: Db,
  attemptId: string,
  status: SendOutcome["status"],
  signal: AbortSignal,
): Promise<void> {
  if (!TERMINAL_UNSENT.includes(status)) return;
  await disableTokens(db, attemptId, signal);
}
