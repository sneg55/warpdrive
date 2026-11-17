import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { makeTestDb } from "@/test/db";
import { loadAttempt, loadSendInputs } from "./outboxClaim";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => {
  ctx = await makeTestDb();
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
