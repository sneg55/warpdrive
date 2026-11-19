import type { Db } from "@/db/client";
import { dealsForContacts, dealsForConversations } from "./affected";
import { enqueueDealSearchRefresh } from "./enqueue";

export interface IntercomWrite {
  conversationIds: string[];
  changedContactIds: string[];
}

export async function enqueueDealSearchForWrite(
  db: Db,
  write: IntercomWrite,
  signal: AbortSignal,
): Promise<void> {
  const [byConversation, byContact] = await Promise.all([
    dealsForConversations(db, write.conversationIds, signal),
    dealsForContacts(db, write.changedContactIds, signal),
  ]);
  await enqueueDealSearchRefresh(db, [...byConversation, ...byContact], signal);
}
