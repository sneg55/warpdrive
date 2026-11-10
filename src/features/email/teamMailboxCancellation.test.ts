import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { makeTestDb } from "@/test/db";
import { loadAttempt, loadSendInputs } from "./outboxClaim";
import { threadVisibility } from "./send.visibility.test-helpers";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => {
  ctx = await makeTestDb();
});

it("stops extracted visibility reads when their required signal is aborted", async () => {
  await expect(
    threadVisibility(ctx.db, randomUUID(), "thread", AbortSignal.abort()),
  ).rejects.toMatchObject({ name: "AbortError" });
});
afterAll(async () => {
  await ctx.close();
});

it("stops send-state reads when their required signal is aborted", async () => {
  const signal = AbortSignal.abort();
  await expect(loadAttempt(ctx.db, randomUUID(), randomUUID(), signal)).rejects.toMatchObject({
    name: "AbortError",
  });
  await expect(loadSendInputs(ctx.db, randomUUID(), randomUUID(), signal)).rejects.toMatchObject({
    name: "AbortError",
  });
});
