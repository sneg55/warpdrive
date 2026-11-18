import { AppError, ERROR_IDS, type ErrorId } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { listActorMailboxes } from "@/features/email/actorMailboxes";
import { err, ok, type Result } from "@/types/result";

export type MailboxScope = { teamMailboxId: string | undefined };

export function mailboxNotUsable(errorId: ErrorId, address: string): AppError {
  return new AppError(
    errorId,
    `mailbox ${address} is not a mailbox you can use; call list_mailboxes for the choices`,
    {},
  );
}

export async function resolveMailboxScope(
  db: Db,
  actorId: string,
  address: string | undefined,
  signal: AbortSignal,
): Promise<Result<MailboxScope, AppError>> {
  if (address === undefined) return ok({ teamMailboxId: undefined });
  const wanted = address.toLowerCase();
  const usable = await listActorMailboxes(db, actorId, signal);
  const match = usable.find((m) => m.emailAddress.toLowerCase() === wanted);
  if (match === undefined)
    return err(mailboxNotUsable(ERROR_IDS.GMAIL_READ_INPUT_INVALID, address));
  return ok({ teamMailboxId: match.kind === "team" ? match.id : undefined });
}
