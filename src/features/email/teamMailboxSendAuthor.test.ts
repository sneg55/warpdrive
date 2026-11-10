import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { seedUser } from "@/db/testing/factories";
import { makeTestDb } from "@/test/db";
import { enqueueSend } from "./outbox";
import { seedTeamMailbox } from "./teamMailbox.test-helpers";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => {
  ctx = await makeTestDb();
});
afterAll(async () => {
  await ctx.close();
});

it("rejects reusing another member's send key", async () => {
  const signal = AbortSignal.timeout(8000);
  const first = await seedUser(ctx.db, { email: "key-first@example.com" });
  const second = await seedUser(ctx.db, { email: "key-second@example.com" });
  const { accountId } = await seedTeamMailbox(ctx.db, [first.id, second.id], signal);
  const args = {
    accountId,
    idempotencyKey: randomUUID(),
    payload: {
      actorId: first.id,
      to: ["customer@example.com"],
      subject: "Private queued send",
      html: "Body",
    },
  };
  expect((await enqueueSend(ctx.db, args, AbortSignal.timeout(8000))).ok).toBe(true);
  const stolen = await enqueueSend(
    ctx.db,
    { ...args, payload: { ...args.payload, actorId: second.id } },
    AbortSignal.timeout(8000),
  );
  expect(stolen.ok).toBe(false);
  expect((await enqueueSend(ctx.db, args, AbortSignal.timeout(8000))).ok).toBe(true);
});

it("does not enqueue when its required signal is already aborted", async () => {
  const signal = AbortSignal.timeout(8000);
  const user = await seedUser(ctx.db, { email: "key-abort@example.com" });
  const { accountId } = await seedTeamMailbox(ctx.db, [user.id], signal);
  const controller = new AbortController();
  controller.abort();
  await expect(
    enqueueSend(
      ctx.db,
      {
        accountId,
        idempotencyKey: randomUUID(),
        payload: { actorId: user.id, to: [], subject: "", html: "" },
      },
      controller.signal,
    ),
  ).rejects.toMatchObject({ name: "AbortError" });
});
