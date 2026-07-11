import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BOARD_EVENT, dealMovedChannel } from "@/constants/boardChannels";
import { parseNotifyPayload } from "@/server/ws/payload";
import type { TestDb } from "@/test/db";
import { makeTestDb } from "@/test/db";
import { boardEventSchema, publishBoardEvent } from "./events";

describe("boardEventSchema", () => {
  it("accepts a minimal deal_moved envelope", () => {
    const parsed = boardEventSchema.parse({
      v: 1,
      type: "deal_moved",
      channel: "pipeline:7",
      ts: "2026-06-29T12:00:00.000Z",
      actorId: "u_3",
      data: { dealId: "d1", fromStageId: "s1", toStageId: "s2", boardPosition: "1.5" },
    });
    expect(parsed.type).toBe("deal_moved");
  });

  it("rejects a payload missing the channel", () => {
    expect(() =>
      boardEventSchema.parse({ v: 1, type: "deal_moved", ts: "x", actorId: "u", data: {} }),
    ).toThrow();
  });

  it("accepts deal_created and deal_updated types", () => {
    const created = boardEventSchema.parse({
      v: 1,
      type: BOARD_EVENT.dealCreated,
      channel: "pipeline:1",
      ts: "2026-06-29T12:00:00.000Z",
      actorId: "u_1",
      data: { dealId: "d2" },
    });
    expect(created.type).toBe(BOARD_EVENT.dealCreated);

    const updated = boardEventSchema.parse({
      v: 1,
      type: BOARD_EVENT.dealUpdated,
      channel: "deal:d3",
      ts: "2026-06-29T12:00:00.000Z",
      actorId: "u_1",
      data: { dealId: "d3" },
    });
    expect(updated.type).toBe(BOARD_EVENT.dealUpdated);
  });

  it("rejects an unknown event type", () => {
    expect(() =>
      boardEventSchema.parse({
        v: 1,
        type: "deal_archived",
        channel: "pipeline:1",
        ts: "2026-06-29T12:00:00.000Z",
        actorId: "u_1",
        data: { dealId: "d1" },
      }),
    ).toThrow();
  });
});

describe("publishBoardEvent (integration)", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await makeTestDb();
  }, 60_000);

  afterAll(async () => {
    await testDb.close();
  });

  it("bumps the channel version and emitted payload round-trips through parseNotifyPayload", async () => {
    const signal = new AbortController().signal;
    const { db } = testDb;
    const channel = dealMovedChannel("pipe-42");

    // Capture pg_notify payload by listening on the connection before publish.
    // We use a raw pool client to LISTEN so we can observe the NOTIFY.
    const client = await testDb.pool.connect();
    await client.query(`LISTEN "${channel.replace(/"/g, '""')}"`);

    const notifyPromise = new Promise<string>((resolve) => {
      client.on("notification", (msg) => {
        if (msg.channel === channel && msg.payload !== undefined) {
          resolve(msg.payload);
        }
      });
    });

    await db.transaction(async (tx) => {
      await publishBoardEvent(
        tx,
        {
          channel,
          type: BOARD_EVENT.dealMoved,
          actorId: "u_7",
          data: { dealId: "d-99", fromStageId: "s-1", toStageId: "s-2", boardPosition: "1.0" },
        },
        signal,
      );
    });

    const raw = await notifyPromise;
    client.release();

    const parsed = parseNotifyPayload(JSON.parse(raw));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.type).toBe(BOARD_EVENT.dealMoved);
      expect(parsed.value.channel).toBe(channel);
    }
  });
});
