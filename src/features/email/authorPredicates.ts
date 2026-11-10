import { type SQL, sql } from "drizzle-orm";
import { mailboxAccessPredicate } from "./mailboxAccess";

export function draftAuthorPredicate(actorId: string): SQL {
  return sql`${mailboxAccessPredicate(actorId)} AND (
    d.author_user_id=${actorId} OR (a.kind='personal' AND d.author_user_id IS NULL AND a.user_id=${actorId})
  )`;
}

export function outboxAuthorPredicate(actorId: string): SQL {
  return sql`${mailboxAccessPredicate(actorId)} AND (
    s.payload->>'actorId'=${actorId} OR (a.kind='personal' AND s.payload->>'actorId' IS NULL AND a.user_id=${actorId})
  )`;
}
