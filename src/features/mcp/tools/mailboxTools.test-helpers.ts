import { sql } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { withTestDb } from "@/db/testing";
import { hydrateActor } from "@/server/hydrateActor";

export type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];

export async function seedPersonal(db: TestDb, userId: string, email: string): Promise<string> {
  const row = (
    await db.execute(
      sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${userId}, ${email}) RETURNING id`,
    )
  ).rows[0] as { id: string };
  return row.id;
}

export async function seedTeam(
  db: TestDb,
  email: string,
  memberIds: string[],
  provider: "gmail" | "agentic_inbox" = "gmail",
): Promise<string> {
  const row = (
    await db.execute(
      sql`INSERT INTO email_accounts (kind, email_address, display_name, status)
        VALUES ('team', ${email}, 'Media', ${provider === "gmail" ? "connected" : "disconnected"}) RETURNING id`,
    )
  ).rows[0] as { id: string };
  if (provider === "agentic_inbox") {
    await db.execute(sql`UPDATE email_accounts SET provider='agentic_inbox' WHERE id=${row.id}`);
  }
  for (const id of memberIds) {
    await db.execute(sql`INSERT INTO email_account_members VALUES (${row.id}, ${id})`);
  }
  return row.id;
}

export async function seedThreadWithMessage(
  db: TestDb,
  accountId: string,
  subject: string,
  args: { direction?: "inbound" | "outbound"; minutesAgo?: number } = {},
): Promise<string> {
  const minutesAgo = args.minutesAgo ?? 0;
  const thread = (
    await db.execute(
      sql`INSERT INTO email_threads (gmail_thread_id, account_id, subject, last_message_at, visibility)
        VALUES (${`g-${subject}`}, ${accountId}, ${subject}, now() - make_interval(mins => ${minutesAgo}), 'shared')
        RETURNING id`,
    )
  ).rows[0] as { id: string };
  await db.execute(sql`
    INSERT INTO email_messages (thread_id, account_id, gmail_message_id, direction, from_email, body_text, sent_at)
    VALUES (${thread.id}, ${accountId}, ${`m-${subject}`}, ${args.direction ?? "inbound"},
      'sender@example.com', ${`body of ${subject}`}, now() - make_interval(mins => ${minutesAgo}))
  `);
  return thread.id;
}

export function payload(result: { content: Array<{ type: string; text?: string }> }): unknown {
  const first = result.content[0];
  return first?.type === "text" ? JSON.parse(first.text ?? "null") : null;
}

export function errorText(result: { content: Array<{ type: string; text?: string }> }): string {
  const first = result.content[0];
  return first?.type === "text" ? (first.text ?? "") : "";
}

export async function actorOf(db: TestDb, userId: string) {
  const actor = await hydrateActor(db, userId, AbortSignal.timeout(5_000));
  if (actor === null) throw new AppError(ERROR_IDS.USER_NOT_FOUND, "actor missing", { userId });
  return actor;
}
