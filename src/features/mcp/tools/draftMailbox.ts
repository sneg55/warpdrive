import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { listActorMailboxes } from "@/features/email/actorMailboxes";
import { getActorMailbox } from "@/features/email/mailboxOwnership";
import { err, ok, type Result } from "@/types/result";

export async function resolveDraftMailbox(
  db: Db,
  actorId: string,
  address: string | undefined,
  signal: AbortSignal,
): Promise<Result<{ id: string }, AppError>> {
  if (address === undefined) {
    const personal = await getActorMailbox(db, actorId, signal);
    if (personal !== null) return ok({ id: personal.id });
    return err(
      new AppError(
        ERROR_IDS.GMAIL_GRANT_REVOKED,
        "no Gmail mailbox is connected for this user",
        {},
      ),
    );
  }
  const wanted = address.toLowerCase();
  const usable = await listActorMailboxes(db, actorId, signal);
  const match = usable.find((m) => m.emailAddress.toLowerCase() === wanted);
  if (match !== undefined) return ok({ id: match.id });
  return err(
    new AppError(
      ERROR_IDS.GMAIL_DRAFT_INPUT_INVALID,
      `mailbox ${address} is not a mailbox you can use; call list_mailboxes for the choices`,
      {},
    ),
  );
}
