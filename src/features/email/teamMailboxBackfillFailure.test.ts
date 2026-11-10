import { sql } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { seedUser } from "@/db/testing/factories";
import { makeTestDb } from "@/test/db";
import { err, ok } from "@/types/result";
import { FakeGmailClient } from "./gmailFake";
import { seedTeamMailbox } from "./teamMailbox.test-helpers";
import { runTeamBackfillPage } from "./teamMailboxBackfill";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => {
  ctx = await makeTestDb();
});
afterAll(async () => {
  await ctx.close();
});

it("records cursor initialization failures for the settings page", async () => {
  const signal = AbortSignal.timeout(8000);
  const member = await seedUser(ctx.db);
  const { accountId } = await seedTeamMailbox(ctx.db, [member.id], signal);
  await ctx.db.execute(sql`UPDATE email_accounts SET backfill_days=90 WHERE id=${accountId}`);
  const gmail = new FakeGmailClient();
  gmail.getProfile = () =>
    Promise.resolve(err(new AppError(ERROR_IDS.GMAIL_API_EXHAUSTED, "profile unavailable", {})));
  const result = await runTeamBackfillPage(ctx.db, {
    accountId,
    gmail,
    signal,
    listThreads: () => Promise.resolve(ok({ threads: [] })),
  });
  expect(result.ok).toBe(false);
  expect(
    (
      await ctx.db.execute(
        sql`SELECT backfill_status, backfill_error_id FROM email_accounts WHERE id=${accountId}`,
      )
    ).rows[0],
  ).toEqual({ backfill_status: "failed", backfill_error_id: ERROR_IDS.GMAIL_API_EXHAUSTED });
});
