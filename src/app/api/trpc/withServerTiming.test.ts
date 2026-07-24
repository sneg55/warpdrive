import { describe, expect, it } from "vitest";
import { withServerTiming } from "./withServerTiming";

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

  it("attaches Server-Timing regardless of a non-2xx status", async () => {
    const inner = (): Promise<Response> => Promise.resolve(new Response("bad", { status: 400 }));

    const res = await withServerTiming(inner)(new Request("http://localhost/api/trpc"));

    expect(res.headers.get("Server-Timing")).toMatch(/^trpc;dur=[\d.]+$/);
    expect(res.status).toBe(400);
  });
});
