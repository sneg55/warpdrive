import { describe, expect, it } from "vitest";
import type { ServerTimingEvent } from "./server";
import { createTimingCollector } from "./timingCollector";

function harness(): {
  clock: { t: number };
  finished: ServerTimingEvent[];
  runScheduled: () => void;
  scheduledCount: () => number;
  collector: ReturnType<typeof createTimingCollector>;
} {
  const clock = { t: 1000 };
  const finished: ServerTimingEvent[] = [];
  const scheduled: (() => void)[] = [];
  const collector = createTimingCollector({
    kind: "page",
    now: () => clock.t,
    schedule: (fn) => scheduled.push(fn),
    onFinish: (e) => finished.push(e),
  });
  return {
    clock,
    finished,
    runScheduled: () => {
      for (const fn of scheduled) fn();
    },
    scheduledCount: () => scheduled.length,
    collector,
  };
}

function resolveAfter<T>(clock: { t: number }, ms: number, value: T): () => Promise<T> {
  return () => {
    clock.t += ms;
    return Promise.resolve(value);
  };
}

describe("createTimingCollector", () => {
  it("returns the work's value and records each span's offset and duration in one event", async () => {
    const h = harness();
    expect(await h.collector.timed("layout", resolveAfter(h.clock, 40, "ctx"))).toBe("ctx");
    h.clock.t += 5;
    await h.collector.timed("deal.workspace", resolveAfter(h.clock, 700, null));
    h.clock.t += 55;
    h.runScheduled();

    expect(h.finished).toEqual([
      {
        kind: "page",
        route: "unknown",
        incomplete: false,
        total_ms: 800,
        spans: {
          layout: { start_ms: 0, dur_ms: 40 },
          "deal.workspace": { start_ms: 45, dur_ms: 700 },
        },
      },
    ]);
  });

  it("labels the event with the route the page declares, timing from the moment it declares it", async () => {
    const h = harness();
    h.collector.labelRoute("/leads");
    h.clock.t += 30;
    await h.collector.timed("leads.data", resolveAfter(h.clock, 10, null));
    h.runScheduled();

    expect(h.finished[0]).toMatchObject({
      route: "/leads",
      total_ms: 40,
      spans: { "leads.data": { start_ms: 30, dur_ms: 10 } },
    });
  });

  it("sends a labelled page even when it records no span of its own", () => {
    const h = harness();
    h.collector.labelRoute("/dashboard");
    h.runScheduled();
    expect(h.finished[0]).toMatchObject({ route: "/dashboard", spans: {} });
  });

  it("keeps the longest duration when the same span name is recorded twice", async () => {
    const h = harness();
    const first = h.collector.timed("deal.load", resolveAfter(h.clock, 300, null));
    const second = h.collector.timed("deal.load", resolveAfter(h.clock, 0, null));
    await Promise.all([first, second]);
    h.runScheduled();
    expect(h.finished[0]?.spans["deal.load"]?.dur_ms).toBe(300);
  });

  it("marks the sample incomplete when the response closes while a span is still running", async () => {
    const h = harness();
    let release: () => void = () => {};
    const pending = h.collector.timed(
      "deal.workspace",
      () => new Promise<void>((r) => (release = r)),
    );
    h.runScheduled();
    expect(h.finished[0]).toMatchObject({ incomplete: true, spans: {} });
    release();
    await pending;
  });

  it("does not mark a sample incomplete when every span finished", async () => {
    const h = harness();
    await h.collector.timed("leads.data", resolveAfter(h.clock, 1, null));
    h.runScheduled();
    expect(h.finished[0]?.incomplete).toBe(false);
  });

  it("schedules a single flush however many spans the request records", async () => {
    const h = harness();
    await h.collector.timed("a", resolveAfter(h.clock, 1, 1));
    await h.collector.timed("b", resolveAfter(h.clock, 1, 2));
    expect(h.scheduledCount()).toBe(1);
  });

  it("still records the span when the work rejects, and rethrows", async () => {
    const h = harness();
    const failing = (): Promise<never> => {
      h.clock.t += 30;
      return Promise.reject(new Error("db down"));
    };
    await expect(h.collector.timed("leads.data", failing)).rejects.toThrow("db down");
    h.runScheduled();
    expect(h.finished[0]?.spans["leads.data"]).toEqual({ start_ms: 0, dur_ms: 30 });
  });

  it("rounds to a tenth of a millisecond", async () => {
    const h = harness();
    await h.collector.timed("layout", resolveAfter(h.clock, 12.3456, null));
    h.runScheduled();
    expect(h.finished[0]?.spans.layout?.dur_ms).toBe(12.3);
  });
});
