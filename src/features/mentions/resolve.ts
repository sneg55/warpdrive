import { and, eq, inArray } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { MentionSource } from "@/constants/mentions";
import type { Db } from "@/db/client";
import { mentions, users } from "@/db/schema";
import { enqueueEmailNotification } from "@/features/notifications/emailDispatch";
import { fanOut } from "@/features/notifications/produce";
import type { CreateNotificationInput } from "@/types/notification";
import type { Result } from "@/types/result";
import { err, ok } from "@/types/result";
import { parseMentions } from "./parse";

type Token = { userId: string; display: string };

// Build notification inputs from surviving tokens.
function buildInputs(
  tokens: Token[],
  args: {
    source: MentionSource;
    sourceId: string;
    entityType: string;
    entityId: string;
    authorId: string;
  },
): CreateNotificationInput[] {
  return tokens.map((t) => ({
    recipientId: t.userId,
    type: "mention" as const,
    entityType: args.entityType,
    entityId: args.entityId,
    actorId: args.authorId,
    payload: { source: args.source, sourceId: args.sourceId, display: t.display },
  }));
}

// Dispatch email for each non-suppressed fanOut result. Returns the count of created notifications.
async function dispatchEmails(
  db: Db,
  results: Awaited<ReturnType<typeof fanOut>>,
  tokens: Token[],
  signal: AbortSignal,
): Promise<number> {
  let created = 0;
  for (let i = 0; i < results.length; i++) {
    const res = results[i];
    const token = tokens[i];
    if (res === undefined || token === undefined) continue;
    if (!res.ok || !("notificationId" in res.value)) continue;
    created += 1;
    await enqueueEmailNotification(db, res.value.notificationId, token.userId, "mention", signal);
  }
  return created;
}

export async function resolveAndStoreMentions(
  db: Db,
  args: {
    source: MentionSource;
    sourceId: string;
    body: string;
    authorId: string;
    entityType: string;
    entityId: string;
    signal: AbortSignal;
  },
): Promise<Result<{ created: number }, AppError>> {
  try {
    args.signal.throwIfAborted();

    // Parse tokens, drop self-mentions.
    const tokens = parseMentions(args.body).filter((t) => t.userId !== args.authorId);
    if (tokens.length === 0) return ok({ created: 0 });

    // Validate that the remaining userIds exist and are active. Silently drop unknowns.
    const userIds = tokens.map((t) => t.userId);
    const realUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(and(inArray(users.id, userIds), eq(users.isActive, true)));
    args.signal.throwIfAborted();

    if (realUsers.length === 0) return ok({ created: 0 });

    const realUserIds = new Set(realUsers.map((u) => u.id));
    const surviving = tokens.filter((t) => realUserIds.has(t.userId));

    // Insert mention rows for all surviving users.
    await db.insert(mentions).values(
      surviving.map((t) => ({
        source: args.source,
        sourceId: args.sourceId,
        mentionedUserId: t.userId,
        authorId: args.authorId,
      })),
    );
    args.signal.throwIfAborted();

    // Fan out notifications; the producer visibility-checks each recipient.
    const results = await fanOut(db, buildInputs(surviving, args), args.signal);

    // Enqueue email for each notification actually created (not suppressed).
    const created = await dispatchEmails(db, results, surviving, args.signal);

    return ok({ created });
  } catch (e) {
    // Always rethrow AbortError; wrap everything else as an AppError.
    if (e instanceof Error && e.name === "AbortError") throw e;
    if (e instanceof AppError) return err(e);
    const msg = e instanceof Error ? e.message : String(e);
    return err(
      new AppError(ERROR_IDS.NOTIF_PRODUCE_FAILED, `resolveAndStoreMentions failed: ${msg}`),
    );
  }
}
