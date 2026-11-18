import { sql } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { seedUser } from "@/db/testing/factories";
import { makeTestDb } from "@/test/db";
import { seedAgenticMailbox } from "./agentic.test-helpers";
import { getThread } from "./emailReads";
import { seedTeamMailbox, teamActor } from "./teamMailbox.test-helpers";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => {
  ctx = await makeTestDb();
});
afterAll(async () => {
  await ctx.close();
});

it("getThread reports the mailbox provider so the UI can gate gmail-only actions", async () => {
  const signal = AbortSignal.timeout(8000);
  const member = await seedUser(ctx.db);
  const gmail = await seedTeamMailbox(ctx.db, [member.id], signal);
  const agenticId = await seedAgenticMailbox(
    ctx.db,
    { address: "provider@example.com", baseUrl: "http://localhost:1", memberIds: [member.id] },
    signal,
  );
  const thread = (
    await ctx.db.execute(sql`INSERT INTO email_threads (account_id, gmail_thread_id, subject, last_message_at)
      VALUES (${agenticId}, 'ag-1', 'Hi', now()) RETURNING id`)
  ).rows[0] as { id: string };
  const read = (threadId: string) =>
    getThread(ctx.db, { actor: teamActor(member.id), threadId, allowRemote: false }, signal);
  const agentic = await read(thread.id);
  const plain = await read(gmail.threadId);
  expect(agentic.ok ? agentic.value.provider : null).toBe("agentic_inbox");
  expect(plain.ok ? plain.value.provider : null).toBe("gmail");
});
