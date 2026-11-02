import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadRepoFacts } from "./loadRepoFacts";

const NOW = new Date("2026-11-02T12:00:00Z");

afterEach(() => {
  vi.restoreAllMocks();
});

async function packageJsonWith(version: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "repo-facts-"));
  const file = path.join(dir, "package.json");
  await writeFile(file, JSON.stringify({ name: "warpdrive", version }));
  return file;
}

function stubGitHub(byPath: Record<string, unknown>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const pathname = new URL(url).pathname;
    const body = byPath[pathname];
    if (body === undefined) return Promise.resolve(new Response("{}", { status: 404 }));
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  });
}

describe("loadRepoFacts", () => {
  it("combines the repo stars, the latest release, and the stamped package version", async () => {
    stubGitHub({
      "/repos/sneg55/warpdrive": { stargazers_count: 74 },
      "/repos/sneg55/warpdrive/releases/latest": {
        tag_name: "v1.4.0",
        published_at: "2026-10-30T18:41:14Z",
      },
    });
    const facts = await loadRepoFacts({
      repoSlug: "sneg55/warpdrive",
      packageJsonPath: await packageJsonWith("1.4.0"),
      now: NOW,
      signal: AbortSignal.timeout(5000),
    });
    expect(facts).toEqual({
      stars: 74,
      release: { version: "1.4.0", releasedOn: "2026-10-30" },
    });
  });

  it("degrades to no facts when GitHub is unreachable and the package file is missing", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));
    const facts = await loadRepoFacts({
      repoSlug: "sneg55/warpdrive",
      packageJsonPath: path.join(tmpdir(), "does-not-exist", "package.json"),
      now: NOW,
      signal: AbortSignal.timeout(5000),
    });
    expect(facts).toEqual({ stars: null, release: null });
  });

  it("passes the abort signal to every GitHub request", async () => {
    const spy = stubGitHub({});
    const signal = AbortSignal.timeout(5000);
    await loadRepoFacts({
      repoSlug: "sneg55/warpdrive",
      packageJsonPath: await packageJsonWith("1.0.0"),
      now: NOW,
      signal,
    });
    expect(spy).toHaveBeenCalledTimes(2);
    for (const call of spy.mock.calls) {
      expect(call[1]?.signal).toBe(signal);
    }
  });
});
