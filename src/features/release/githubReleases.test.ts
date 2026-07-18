import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLatestRelease } from "./githubReleases";

const signal = (): AbortSignal => new AbortController().signal;

function stubFetch(fn: () => Promise<Response>): void {
  vi.stubGlobal("fetch", vi.fn(fn));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchLatestRelease", () => {
  it("maps a successful GitHub release into ReleaseInfo", async () => {
    stubFetch(() =>
      Promise.resolve(
        Response.json({
          tag_name: "v1.7.0",
          name: "1.7.0",
          html_url: "https://github.com/sneg55/warpdrive/releases/tag/v1.7.0",
          body: "## What's new\n- stuff",
        }),
      ),
    );
    const r = await fetchLatestRelease(signal());
    expect(r).toMatchObject({
      ok: true,
      value: {
        latestTag: "v1.7.0",
        releaseUrl: "https://github.com/sneg55/warpdrive/releases/tag/v1.7.0",
        releaseNotes: "## What's new\n- stuff",
      },
    });
  });

  it("returns an error result on a non-2xx response", async () => {
    stubFetch(() => Promise.resolve(new Response("rate limited", { status: 403 })));
    expect(await fetchLatestRelease(signal())).toMatchObject({ ok: false });
  });

  it("returns an error result when the request rejects (network error)", async () => {
    stubFetch(() => Promise.reject(new TypeError("network down")));
    expect(await fetchLatestRelease(signal())).toMatchObject({ ok: false });
  });

  it("returns an error result on malformed JSON", async () => {
    stubFetch(() => Promise.resolve(new Response("not json", { status: 200 })));
    expect(await fetchLatestRelease(signal())).toMatchObject({ ok: false });
  });

  it("passes the abort signal through to fetch", async () => {
    const spy = vi.fn(() => Promise.resolve(Response.json({ tag_name: "v1.0.0" })));
    vi.stubGlobal("fetch", spy);
    const s = signal();
    await fetchLatestRelease(s);
    expect(spy).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ signal: s }));
  });
});
