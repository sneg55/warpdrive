import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { type AppError, ERROR_IDS } from "@/constants/errorIds";
import { INTERCOM_DETAIL_CONCURRENCY } from "@/constants/intercom";
import type * as schema from "@/db/schema";
import { type ContactRow, freshContactIds } from "./contactRepo";
import { matchableEmail, normalizeConversation } from "./normalize";
import { type StoredConversation, storedUpdatedAt } from "./repo";
import type { IntercomClient, IntercomConversation, SearchItem } from "./types";

type Db = NodePgDatabase<typeof schema>;

export type ItemOutcome =
  | { kind: "ok"; updatedAt: number; stored: StoredConversation; contacts: ContactRow[] }
  | { kind: "unchanged"; updatedAt: number }
  | { kind: "gone"; id: string; updatedAt: number }
  | { kind: "failed"; updatedAt: number; retry: boolean };

interface FetchDeps {
  db: Db;
  client: IntercomClient;
}

export type ContactOutcome = { ok: true; row: ContactRow } | { ok: false };

export async function inBatches<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  signal: AbortSignal,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += INTERCOM_DETAIL_CONCURRENCY) {
    signal.throwIfAborted();
    out.push(...(await Promise.all(items.slice(i, i + INTERCOM_DETAIL_CONCURRENCY).map(fn))));
  }
  return out;
}

function logItem(e: AppError, what: string, id: string): void {
  console.error(`${e.id} intercom sync: ${what} ${id} not stored`, e.context);
}

function isPermanentMiss(e: AppError): boolean {
  return e.id === ERROR_IDS.INTERCOM_NOT_FOUND || e.id === ERROR_IDS.INTERCOM_PARSE_FAILED;
}

export async function fetchContact(
  client: IntercomClient,
  id: string,
  signal: AbortSignal,
): Promise<ContactOutcome> {
  const r = await client.getContact(id, signal);
  if (r.ok)
    return { ok: true, row: { id, email: matchableEmail(r.value.email), role: r.value.role } };
  if (isPermanentMiss(r.error)) {
    return { ok: true, row: { id, email: null, role: null, gone: true } };
  }
  logItem(r.error, "contact", id);
  return { ok: false };
}

async function resolveContacts(
  deps: FetchDeps,
  conversations: IntercomConversation[],
  freshSince: Date,
  signal: AbortSignal,
): Promise<Map<string, ContactOutcome>> {
  const ids = [...new Set(conversations.flatMap((c) => c.contactIds))];
  const fresh = await freshContactIds(deps.db, ids, freshSince, signal);
  const stale = ids.filter((id) => !fresh.has(id));
  const fetched = await inBatches(
    stale,
    async (id): Promise<[string, ContactOutcome]> => [
      id,
      await fetchContact(deps.client, id, signal),
    ],
    signal,
  );
  return new Map(fetched);
}

function failedOutcome(item: SearchItem, e: AppError): ItemOutcome {
  if (e.id === ERROR_IDS.INTERCOM_NOT_FOUND) {
    return { kind: "gone", id: item.id, updatedAt: item.updatedAt };
  }
  logItem(e, "conversation", item.id);
  return {
    kind: "failed",
    updatedAt: item.updatedAt,
    retry: e.id !== ERROR_IDS.INTERCOM_PARSE_FAILED,
  };
}

function storedOutcome(
  item: SearchItem,
  conversation: IntercomConversation,
  contacts: Map<string, ContactOutcome>,
): ItemOutcome {
  const own = conversation.contactIds.map((id) => contacts.get(id));
  if (own.some((c) => c?.ok === false)) {
    return { kind: "failed", updatedAt: item.updatedAt, retry: true };
  }
  return {
    kind: "ok",
    updatedAt: item.updatedAt,
    stored: { ...normalizeConversation(conversation), contactIds: conversation.contactIds },
    contacts: own.flatMap((c) => (c?.ok === true ? [c.row] : [])),
  };
}

export async function fetchPageItems(
  deps: FetchDeps,
  items: SearchItem[],
  contactFreshSince: Date,
  signal: AbortSignal,
): Promise<ItemOutcome[]> {
  const known = await storedUpdatedAt(
    deps.db,
    items.map((i) => i.id),
    signal,
  );
  const changed = items.filter((i) => known.get(i.id) !== i.updatedAt);
  const details = await inBatches(
    changed,
    async (item) => ({ item, result: await deps.client.getConversation(item.id, signal) }),
    signal,
  );
  const fetched = details.flatMap((d) => (d.result.ok ? [d.result.value] : []));
  const contacts = await resolveContacts(deps, fetched, contactFreshSince, signal);
  const unchanged: ItemOutcome[] = items
    .filter((i) => known.get(i.id) === i.updatedAt)
    .map((i) => ({ kind: "unchanged", updatedAt: i.updatedAt }));
  const outcomes = details.map(({ item, result }) =>
    result.ok ? storedOutcome(item, result.value, contacts) : failedOutcome(item, result.error),
  );
  return [...unchanged, ...outcomes];
}
