import { describe, expect, it } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import { makeBrevoHttp } from "./brevoHttp";
import type { BrevoHttpConfig } from "./types";

const SIG = (): AbortSignal => new AbortController().signal;

function harness(
  responses: Array<() => Response>,
  overrides: Partial<BrevoHttpConfig> = {},
): {
  http: ReturnType<typeof makeBrevoHttp>;
  calls: Array<{ url: string; at: number; init: RequestInit }>;
  sleeps: number[];
} {
  let clock = 1_000_000;
  const calls: Array<{ url: string; at: number; init: RequestInit }> = [];
  const sleeps: number[] = [];
  let i = 0;
  const http = makeBrevoHttp({
    apiKey: "test-key",
    baseUrl: "https://api.brevo.test/v3",
    fetch: (url, init) => {
      calls.push({ url: String(url), at: clock, init });
      const next = responses[Math.min(i, responses.length - 1)];
      i += 1;
      if (next === undefined) return Promise.reject(new TypeError("no response"));
      return Promise.resolve(next());
    },
    sleep: (ms) => {
      sleeps.push(ms);
      clock += ms;
      return Promise.resolve();
    },
    nowMs: () => clock,
    ...overrides,
  });
  return { http, calls, sleeps };
}

const limited = (reset?: string) => () =>
  new Response("{}", {
    status: 429,
    headers: reset === undefined ? {} : { "x-sib-ratelimit-reset": reset },
  });

describe("makeBrevoHttp", () => {
  it("sends the api-key header to the base url", async () => {
    const h = harness([() => Response.json({ ok: 1 })]);
    const r = await h.http("/emailCampaigns?limit=1", SIG());
    expect(r).toEqual({ ok: true, value: { kind: "ok", json: { ok: 1 } } });
    expect(h.calls[0]?.url).toBe("https://api.brevo.test/v3/emailCampaigns?limit=1");
    expect(new Headers(h.calls[0]?.init.headers).get("api-key")).toBe("test-key");
  });

  it("never makes more than 5 calls in any second, retries included", async () => {
    const h = harness([limited("0"), limited("0"), () => Response.json({})]);
    for (let n = 0; n < 12; n += 1) await h.http("/x", SIG());
    const times = h.calls.map((c) => c.at);
    for (const start of times) {
      const inWindow = times.filter((t) => t >= start && t < start + 1000);
      expect(inWindow.length).toBeLessThanOrEqual(5);
    }
  });

  it("waits for the reset header on a 429 and retries the same call", async () => {
    const h = harness([limited("3"), () => Response.json({ done: true })]);
    const r = await h.http("/x", SIG());
    expect(r.ok && r.value.kind === "ok").toBe(true);
    expect(h.calls).toHaveLength(2);
    expect(h.sleeps.some((ms) => ms >= 3000)).toBe(true);
  });

  it("ends in E_BREVO_002 once the retries are spent", async () => {
    const h = harness([limited("1")]);
    const r = await h.http("/x", SIG());
    expect(!r.ok && r.error.id).toBe(ERROR_IDS.BREVO_RATE_LIMITED);
    expect(h.calls).toHaveLength(6);
  });

  it("maps 401 to E_BREVO_005 carrying the response message", async () => {
    const h = harness([
      () =>
        Response.json(
          { code: "unauthorized", message: "unrecognised IP address 1.2.3.4" },
          { status: 401 },
        ),
    ]);
    const r = await h.http("/x", SIG());
    expect(!r.ok && r.error.id).toBe(ERROR_IDS.BREVO_UNAUTHORIZED);
    expect(!r.ok && r.error.message).toContain("unrecognised IP address");
  });

  it("treats a document_not_found 404 as not found and any other 404 as a failure", async () => {
    const missing = harness([
      () =>
        Response.json(
          { code: "document_not_found", message: "Contact not found" },
          { status: 404 },
        ),
    ]);
    expect(await missing.http("/x", SIG())).toEqual({ ok: true, value: { kind: "notFound" } });
    const other = harness([() => Response.json({ code: "route_not_found" }, { status: 404 })]);
    const r = await other.http("/x", SIG());
    expect(!r.ok && r.error.id).toBe(ERROR_IDS.BREVO_HTTP_FAILED);
  });

  it("marks 5xx as transient", async () => {
    const h = harness([() => new Response("", { status: 503 })]);
    const r = await h.http("/x", SIG());
    expect(!r.ok && r.error.id).toBe(ERROR_IDS.BREVO_HTTP_FAILED);
    expect(!r.ok && r.error.context?.transient).toBe(true);
  });

  it("reports a non-json body as E_BREVO_004", async () => {
    const h = harness([() => new Response("<html>", { status: 200 })]);
    const r = await h.http("/x", SIG());
    expect(!r.ok && r.error.id).toBe(ERROR_IDS.BREVO_PARSE_FAILED);
  });

  it("ends a request that outlives the per-request timeout in E_BREVO_003", async () => {
    const h = harness([], {
      requestTimeoutMs: 20,
      fetch: (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason as Error));
        }),
    });
    const r = await h.http("/x", SIG());
    expect(!r.ok && r.error.id).toBe(ERROR_IDS.BREVO_NETWORK_FAILED);
  });

  it("propagates cancellation of the run signal instead of returning a failure", async () => {
    const controller = new AbortController();
    const h = harness([], {
      fetch: (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason as Error));
          controller.abort(new Error("run cancelled"));
        }),
    });
    await expect(h.http("/x", controller.signal)).rejects.toThrow("run cancelled");
  });

  it("propagates run cancellation that lands while an error body is being read", async () => {
    const controller = new AbortController();
    const body = new ReadableStream<Uint8Array>({
      pull(stream) {
        controller.abort(new Error("run cancelled"));
        stream.error(new Error("body aborted"));
      },
    });
    const h = harness([() => new Response(body, { status: 401 })]);
    await expect(h.http("/x", controller.signal)).rejects.toThrow("run cancelled");
  });
});
