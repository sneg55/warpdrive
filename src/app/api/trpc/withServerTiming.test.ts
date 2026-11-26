import { describe, expect, it, vi } from "vitest";
import type { ServerTimingEvent } from "@/features/observability/server";
import { withServerTiming } from "./withServerTiming";

const REGISTERED = new Set(["email.inbox.list", "deal.get"]);

async function reportFor(pathAndQuery: string): Promise<ServerTimingEvent[]> {
  const reported: ServerTimingEvent[] = [];
  const inner = (): Promise<Response> => Promise.resolve(new Response("ok"));
  await withServerTiming(inner, {
    report: (e) => reported.push(e),
    isKnownProcedure: (p) => REGISTERED.has(p),
    enabled: () => true,
  })(new Request(`http://localhost/api/trpc/${pathAndQuery}`));
  return reported;
}

describe("withServerTiming", () => {
  it("attaches Server-Timing while preserving body, status, and existing headers", async () => {
    const inner = (): Promise<Response> =>
      Promise.resolve(new Response("ok", { status: 200, headers: { "X-Existing": "1" } }));

    const res = await withServerTiming(inner)(new Request("http://localhost/api/trpc"));

    expect(res.headers.get("Server-Timing")).toMatch(/^trpc;dur=[\d.]+$/);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
    expect(res.headers.get("X-Existing")).toBe("1");
  });

  it("reports the request's procedure paths and duration as a trpc server_timing event", async () => {
    const reported = await reportFor("email.inbox.list,deal.get?batch=1");

    expect(reported).toEqual([
      {
        kind: "trpc",
        total_ms: expect.any(Number) as unknown,
        spans: {
          "email.inbox.list,deal.get": { start_ms: 0, dur_ms: expect.any(Number) as unknown },
        },
      },
    ]);
  });

  it("labels a path segment the router does not register as unknown instead of sending it", async () => {
    const reported = await reportFor("email.inbox.list,jane%40acme.com?batch=1");

    expect(Object.keys(reported[0]?.spans ?? {})).toEqual(["email.inbox.list,unknown"]);
  });

  it("decodes an encoded batch the way the tRPC adapter does", async () => {
    const reported = await reportFor("email.inbox.list%2Cdeal.get?batch=1");
    expect(Object.keys(reported[0]?.spans ?? {})).toEqual(["email.inbox.list,deal.get"]);
  });

  it("treats a comma path without the batch flag as one unknown procedure", async () => {
    const reported = await reportFor("email.inbox.list,deal.get");
    expect(Object.keys(reported[0]?.spans ?? {})).toEqual(["unknown"]);
  });

  it("labels a malformed percent-encoding as unknown", async () => {
    const reported = await reportFor("deal.get%E0%A4%A?batch=1");
    expect(Object.keys(reported[0]?.spans ?? {})).toEqual(["unknown"]);
  });

  it("sends nothing for a request that asks not to be tracked, but keeps the header", async () => {
    const reported: ServerTimingEvent[] = [];
    const inner = (): Promise<Response> => Promise.resolve(new Response("ok"));

    const res = await withServerTiming(inner, {
      report: (e) => reported.push(e),
      isKnownProcedure: () => true,
      enabled: () => true,
    })(new Request("http://localhost/api/trpc/deal.get", { headers: { DNT: "1" } }));

    expect(reported).toEqual([]);
    expect(res.headers.get("Server-Timing")).toMatch(/^trpc;dur=/);
  });

  it("does no labelling or reporting when server telemetry is off", async () => {
    const isKnownProcedure = vi.fn(() => true);
    const report = vi.fn();
    const inner = (): Promise<Response> => Promise.resolve(new Response("ok"));

    const res = await withServerTiming(inner, { report, isKnownProcedure, enabled: () => false })(
      new Request("http://localhost/api/trpc/deal.get"),
    );

    expect(isKnownProcedure).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
    expect(res.headers.get("Server-Timing")).toMatch(/^trpc;dur=/);
  });

  it("attaches Server-Timing regardless of a non-2xx status", async () => {
    const inner = (): Promise<Response> => Promise.resolve(new Response("bad", { status: 400 }));

    const res = await withServerTiming(inner)(new Request("http://localhost/api/trpc"));

    expect(res.headers.get("Server-Timing")).toMatch(/^trpc;dur=[\d.]+$/);
    expect(res.status).toBe(400);
  });
});
