import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TestDb } from "@/test/db";
import { makeTestDb } from "@/test/db";
import { bumpChannelVersion } from "./channelVersions";

// Real Postgres integration test: no mocks, real migrations (no mock/prod divergence).
describe("bumpChannelVersion", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await makeTestDb();
  }, 60_000);

  afterAll(async () => {
    await testDb.close();
  });

  it("starts at 1 and increments monotonically per channel", async () => {
    const signal = new AbortController().signal;
    const { db } = testDb;

    const v1 = await bumpChannelVersion(db, "pipeline:7", signal);
    const v2 = await bumpChannelVersion(db, "pipeline:7", signal);
    const other = await bumpChannelVersion(db, "pipeline:8", signal);

    expect(v1).toBe(1);
    expect(v2).toBe(2);
    expect(other).toBe(1);
  });
});
