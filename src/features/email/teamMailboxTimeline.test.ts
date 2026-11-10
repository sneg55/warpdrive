import { sql } from "drizzle-orm";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { makeTestDb } from "@/test/db";
import { listMessagesForContact, listMessagesForDeal } from "./entityMessageReads";
import { seedTeamMailbox, teamActor } from "./teamMailbox.test-helpers";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => {
  ctx = await makeTestDb();
});
afterAll(async () => {
  await ctx.close();
});

it.each([
  "deal",
  "contact",
] as const)("allows members to compose from the %s timeline with set-based access", async (entity) => {
  const signal = AbortSignal.timeout(8000);
  const member = await seedUser(ctx.db);
  const viewer = await seedUser(ctx.db);
  const { pipeline, stages } = await seedPipelineWithStages(ctx.db, ["Open"]);
  const stage = stages[0];
  if (stage === undefined) throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "missing test stage", {});
  const deal = (
    await ctx.db.execute(sql`
    INSERT INTO deals (title, pipeline_id, stage_id, owner_id, visibility_level)
    VALUES ('Deal', ${pipeline.id}, ${stage.id}, ${member.id}, 'all') RETURNING id
  `)
  ).rows[0] as { id: string };
  const person = (
    await ctx.db.execute(sql`
    INSERT INTO persons (name, owner_id, visibility_level)
    VALUES ('Customer', ${member.id}, 'all') RETURNING id
  `)
  ).rows[0] as { id: string };
  const { accountId, threadId } = await seedTeamMailbox(ctx.db, [member.id], signal);
  await ctx.db.execute(
    sql`UPDATE email_threads SET deal_id=${deal.id}, person_id=${person.id}, visibility='shared' WHERE id=${threadId}`,
  );
  await ctx.db.execute(sql`
    INSERT INTO email_messages (thread_id, account_id, gmail_message_id, direction, from_email)
    SELECT ${threadId}, ${accountId}, n::text, 'inbound', 'customer@external.com' FROM generate_series(1, 3) n
  `);
  const read = (userId: string) =>
    entity === "deal"
      ? listMessagesForDeal(ctx.db, { actor: teamActor(userId), dealId: deal.id }, signal)
      : listMessagesForContact(ctx.db, { actor: teamActor(userId), personId: person.id }, signal);
  const execute = vi.spyOn(ctx.db, "execute");
  try {
    const messages = await read(member.id);
    expect(messages).toHaveLength(3);
    expect(messages.map((message) => message.canCompose)).toEqual([true, true, true]);
    expect(execute).toHaveBeenCalledTimes(1);
  } finally {
    execute.mockRestore();
  }
  expect((await read(viewer.id)).map((message) => message.canCompose)).toEqual([
    false,
    false,
    false,
  ]);
  await ctx.db.execute(sql`DELETE FROM email_account_members WHERE account_id=${accountId}`);
  expect((await read(member.id)).map((message) => message.canCompose)).toEqual([
    false,
    false,
    false,
  ]);
});
