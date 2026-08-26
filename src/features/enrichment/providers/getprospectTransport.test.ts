import { afterEach, describe, expect, it, vi } from "vitest";
import { getprospectProvider } from "./getprospect";

const API_KEY = "gp-secret-key-value";
const SIGNAL = new AbortController().signal;
const PERSON = { fullName: "Dana Hoskova", companyDomain: "sprinx.com" };

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe("getprospectProvider transport failures", () => {
  it("treats a non-JSON 200 body as a provider error rather than throwing", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(
        new Response("<html>maintenance</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      ),
    );
    const out = await getprospectProvider.matchPerson(PERSON, API_KEY, SIGNAL);
    expect(out.kind).toBe("provider_error");
    expect(out.message ?? "").not.toContain("<html>");
  });

  it("returns a provider error when the network fails", async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new TypeError("fetch failed")));
    const out = await getprospectProvider.matchPerson(PERSON, API_KEY, SIGNAL);
    expect(out.kind).toBe("provider_error");
  });

  // The caller times out with AbortSignal.timeout, whose rejection is named TimeoutError. Reading
  // that as an outage puts a slow provider on the same footing as a dead one.
  it("classifies a request timeout as timeout, not as an unreachable provider", async () => {
    const timedOut = new Error("The operation was aborted due to timeout");
    timedOut.name = "TimeoutError";
    globalThis.fetch = vi.fn(() => Promise.reject(timedOut));
    const out = await getprospectProvider.matchPerson(PERSON, API_KEY, SIGNAL);
    expect(out.kind).toBe("timeout");
    expect(out.message ?? "").toContain("timed out");
  });

  it("lets an AbortError propagate instead of reporting a miss", async () => {
    const aborted = new Error("aborted");
    aborted.name = "AbortError";
    globalThis.fetch = vi.fn(() => Promise.reject(aborted));
    await expect(getprospectProvider.matchPerson(PERSON, API_KEY, SIGNAL)).rejects.toThrow(
      "aborted",
    );
  });
});
