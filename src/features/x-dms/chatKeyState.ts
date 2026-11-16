import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { xAccountChatKeys, xAccounts } from "@/db/schema/xDms";
import type { XChatKeyState } from "@/types/xChat";

export interface ChatKeyStateInput {
  keyVersions: string[];
  latestKeyVersion: string | null;
  brokenAt: Date | null;
}

export function chatKeyState(row: ChatKeyStateInput): XChatKeyState {
  if (row.keyVersions.length === 0) return "locked";
  if (row.brokenAt !== null) return "stale";
  if (row.latestKeyVersion === null) return "unlocked";
  return row.keyVersions.includes(row.latestKeyVersion) ? "unlocked" : "stale";
}

export async function loadChatKeyState(
  db: Db,
  accountId: string,
  signal: AbortSignal,
): Promise<XChatKeyState> {
  const [account] = await db
    .select({
      latestKeyVersion: xAccounts.chatLatestKeyVersion,
      brokenAt: xAccounts.chatKeysBrokenAt,
    })
    .from(xAccounts)
    .where(eq(xAccounts.id, accountId));
  signal.throwIfAborted();
  const versions = await db
    .select({ keyVersion: xAccountChatKeys.keyVersion })
    .from(xAccountChatKeys)
    .where(eq(xAccountChatKeys.accountId, accountId));
  signal.throwIfAborted();
  return chatKeyState({
    keyVersions: versions.map((v) => v.keyVersion),
    latestKeyVersion: account?.latestKeyVersion ?? null,
    brokenAt: account?.brokenAt ?? null,
  });
}
