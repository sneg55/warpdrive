// Per-recipient fan-out authorization (ops spec A3, Codex finding F4). Channel
// membership is a coarse gate; before writing any deal-naming event to a socket the
// server must re-evaluate canSee(subscriber, deal) LIVE and drop the event entirely
// (no payload AND no seq advance) when the recipient cannot see that deal. Visibility
// is live: a deal owned by another user must never leak on a shared pipeline channel.

import { sql } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { deals } from "@/db/schema/deals";
import { seedPipelineWithStages } from "@/db/testing/factories";
import { authed, h, nextMessage, otherUserId, userId } from "./testHarness.test";

// Publish a deal-naming event (deal_moved) on an arbitrary channel with a chosen dealId.
async function publishDealMoved(channel: string, dealId: string): Promise<void> {
  const event = {
    v: 1,
    channel,
    ts: new Date().toISOString(),
    actorId: null,
    type: "deal_moved",
    data: { dealId, toStageId: "s" },
  };
  await h.db.execute(sql`SELECT pg_notify(${channel}, ${JSON.stringify(event)})`);
}

async function seedPipe(): Promise<{ pipelineId: string; stageId: string }> {
  const p = await seedPipelineWithStages(h.db, ["S1"]);
  const stage = p.stages[0];
  if (stage === undefined) throw new Error("seed: no stage");
  return { pipelineId: p.pipeline.id, stageId: stage.id };
}

async function seedDeal(
  pipelineId: string,
  stageId: string,
  ownerId: string,
  boardPosition: string,
): Promise<string> {
  const [row] = await h.db
    .insert(deals)
    .values({
      title: "d",
      status: "open",
      pipelineId,
      stageId,
      boardPosition,
      ownerId,
      visibilityLevel: "owner",
    })
    .returning();
  if (row === undefined) throw new Error("seed: deal insert failed");
  return row.id;
}

describe("ws per-recipient fan-out", () => {
  test("drops a deal_moved event for a deal the subscriber cannot see", async () => {
    const { pipelineId, stageId } = await seedPipe();
    // Deal owned by ANOTHER user at owner-level: userId cannot see it.
    const hiddenDealId = await seedDeal(pipelineId, stageId, otherUserId, "1000");

    const ws = await authed();
    ws.send(JSON.stringify({ kind: "subscribe", channel: `pipeline:${pipelineId}` }));
    await nextMessage(ws, "subscribed");

    let delivered = false;
    ws.on("message", (raw: Buffer) => {
      const msg = JSON.parse(raw.toString()) as { kind?: string };
      if (msg.kind === "event") delivered = true;
    });
    await publishDealMoved(`pipeline:${pipelineId}`, hiddenDealId);
    await new Promise((r) => setTimeout(r, 400));
    expect(delivered).toBe(false);
  });

  test("delivers a deal_moved event for a deal the subscriber can see (seq 0)", async () => {
    const { pipelineId, stageId } = await seedPipe();
    const visibleDealId = await seedDeal(pipelineId, stageId, userId, "1000");

    const ws = await authed();
    ws.send(JSON.stringify({ kind: "subscribe", channel: `pipeline:${pipelineId}` }));
    await nextMessage(ws, "subscribed");

    const eventP = nextMessage(ws, "event");
    await publishDealMoved(`pipeline:${pipelineId}`, visibleDealId);
    const evt = await eventP;
    const inner = evt.event as { seq: number; data: { dealId: string } };
    expect(inner.data.dealId).toBe(visibleDealId);
    expect(inner.seq).toBe(0);
  });

  test("a dropped (invisible) event does NOT advance the per-socket seq", async () => {
    const { pipelineId, stageId } = await seedPipe();
    const hiddenDealId = await seedDeal(pipelineId, stageId, otherUserId, "1000");
    const visibleDealId = await seedDeal(pipelineId, stageId, userId, "2000");

    const ws = await authed();
    ws.send(JSON.stringify({ kind: "subscribe", channel: `pipeline:${pipelineId}` }));
    await nextMessage(ws, "subscribed");

    const eventP = nextMessage(ws, "event");
    // Hidden first (must be dropped, no seq advance), then visible.
    await publishDealMoved(`pipeline:${pipelineId}`, hiddenDealId);
    await new Promise((r) => setTimeout(r, 150));
    await publishDealMoved(`pipeline:${pipelineId}`, visibleDealId);
    const evt = await eventP;
    const inner = evt.event as { seq: number; data: { dealId: string } };
    expect(inner.data.dealId).toBe(visibleDealId);
    // seq stayed at 0 because the suppressed event never advanced it.
    expect(inner.seq).toBe(0);
  });
});
