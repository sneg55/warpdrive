import { afterAll, beforeAll, expect, it } from "vitest";
import { makeTestDb } from "@/test/db";
import { checkHealth } from "./healthCheck";

let h: Awaited<ReturnType<typeof makeTestDb>>;
const sig = () => new AbortController().signal;

beforeAll(async () => {
  h = await makeTestDb();
}, 60_000);
afterAll(async () => {
  await h.close();
});

it("reports ok when the database answers a trivial query", async () => {
  const result = await checkHealth(h.db, sig());
  expect(result.ok).toBe(true);
});

it("reports not-ok (does not throw) when the database is unreachable", async () => {
  // Take the pool down under the check so the SELECT fails for a real reason.
  const broken = await makeTestDb();
  await broken.close();

  const result = await checkHealth(broken.db, sig());

  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.length).toBeGreaterThan(0);
  }
});

it("aborts before querying when the signal is already aborted", async () => {
  const result = await checkHealth(h.db, AbortSignal.abort());
  expect(result.ok).toBe(false);
});
