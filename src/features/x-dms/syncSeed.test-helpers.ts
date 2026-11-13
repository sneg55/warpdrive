import { eq } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { X_SNOWFLAKE_EPOCH_MS } from "@/constants/xDms";
import type { Db } from "@/db/client";
import { xAccounts, xConversations, xMessages } from "@/db/schema/xDms";
import { encryptToken } from "@/features/email/crypto";
import { FIXTURE_ME, FIXTURE_THEM } from "./eventFixtures.test-helpers";
import type { SyncDeps } from "./sync";
import type { XRawEvent } from "./types";
import type { XFake } from "./xFake.test-helpers";

export const DAY_MS = 86_400_000;
export const NOW_MS = Date.UTC(2026, 0, 31, 12);
export const CONVERSATION = `${FIXTURE_ME}-${FIXTURE_THEM}`;
export const THEM_USER = {
  id: FIXTURE_THEM,
  username: "them",
  name: "Them Person",
  profileImageUrl: "https://example.com/them.png",
};

let seq = 0;

export function idAt(ms: number): string {
  seq += 1;
  return ((BigInt(ms - X_SNOWFLAKE_EPOCH_MS) << 22n) | BigInt(seq)).toString();
}

export function eventFrom(
  template: XRawEvent,
  o: { at: number; senderId: string; conversationId?: string },
): XRawEvent {
  return {
    ...template,
    id: idAt(o.at),
    senderId: o.senderId,
    createdAt: new Date(o.at),
    conversationId: o.conversationId ?? CONVERSATION,
  };
}

export async function seedAccount(
  db: Db,
  o: { xUserId?: string; syncedAt?: Date | null; status?: "connected" | "reconnect_required" } = {},
): Promise<string> {
  const [row] = await db
    .insert(xAccounts)
    .values({
      xUserId: o.xUserId ?? FIXTURE_ME,
      username: "brand",
      displayName: "Brand",
      refreshTokenEnc: encryptToken("stored-refresh"),
      accessTokenEnc: encryptToken("stored-access"),
      accessTokenExpiresAt: new Date(Date.now() + DAY_MS),
      conversationsSyncedAt: o.syncedAt ?? null,
      status: o.status ?? "connected",
    })
    .returning({ id: xAccounts.id });
  if (!row) throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "seedAccount returned no row");
  return row.id;
}

export function putConversation(
  fake: XFake,
  o: { id?: string; participantId?: string; events: XRawEvent[]; type?: string },
): void {
  const id = o.id ?? CONVERSATION;
  const events = [...o.events].sort((a, b) => (BigInt(b.id) > BigInt(a.id) ? 1 : -1));
  fake.events.set(id, events);
  const conversation = {
    id,
    type: o.type ?? "direct",
    participantIds: [o.participantId ?? FIXTURE_THEM],
    unread: true,
    newestEventId: events[0]?.id ?? null,
  };
  const others = fake.conversations.filter((c) => c.id !== id);
  fake.conversations = [conversation, ...others].sort((a, b) =>
    BigInt(b.newestEventId ?? "0") > BigInt(a.newestEventId ?? "0") ? 1 : -1,
  );
}

export function addEvents(fake: XFake, events: XRawEvent[], id: string = CONVERSATION): void {
  const current = fake.conversations.find((c) => c.id === id);
  putConversation(fake, {
    id,
    participantId: current?.participantIds[0],
    events: [...events, ...(fake.events.get(id) ?? [])],
  });
}

export function deps(db: Db, fake: XFake): SyncDeps {
  return { db, client: fake.client, nowMs: () => NOW_MS };
}

export const eventRequests = (fake: XFake) =>
  fake.requests.filter((r) => r.path.endsWith("/events")).map((r) => r.maxResults);

export async function conversationRow(db: Db, accountId: string, id: string = CONVERSATION) {
  const rows = await db
    .select()
    .from(xConversations)
    .where(eq(xConversations.accountId, accountId));
  return rows.find((r) => r.xConversationId === id);
}

export async function messageRows(db: Db, conversationId: string) {
  const rows = await db
    .select()
    .from(xMessages)
    .where(eq(xMessages.conversationId, conversationId));
  return rows.sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());
}

export async function accountRow(db: Db, id: string) {
  const [row] = await db.select().from(xAccounts).where(eq(xAccounts.id, id));
  return row;
}
