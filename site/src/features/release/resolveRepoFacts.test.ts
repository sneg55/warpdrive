import { describe, expect, it } from "vitest";
import { resolveRepoFacts } from "./resolveRepoFacts";

const BUILD_DATE = new Date("2026-11-02T12:00:00Z");
const REPO = { stargazers_count: 74 };
const RELEASE = { tag_name: "v1.4.0", published_at: "2026-10-30T18:41:14Z" };

describe("resolveRepoFacts", () => {
  it("takes the version and date from the latest GitHub release", () => {
    const facts = resolveRepoFacts({
      repoJson: REPO,
      releaseJson: RELEASE,
      packageVersion: "1.4.0",
      buildDate: BUILD_DATE,
    });
    expect(facts.release).toEqual({ version: "1.4.0", releasedOn: "2026-10-30" });
    expect(facts.stars).toBe(74);
  });

  it("prefers a newer stamped package version, dated at build, when the release is not published yet", () => {
    const facts = resolveRepoFacts({
      repoJson: REPO,
      releaseJson: RELEASE,
      packageVersion: "1.5.0",
      buildDate: BUILD_DATE,
    });
    expect(facts.release).toEqual({ version: "1.5.0", releasedOn: "2026-11-02" });
  });

  it("ignores an older package version left by an untagged publish", () => {
    const facts = resolveRepoFacts({
      repoJson: REPO,
      releaseJson: RELEASE,
      packageVersion: "1.0.0",
      buildDate: BUILD_DATE,
    });
    expect(facts.release?.version).toBe("1.4.0");
  });

  it("compares versions numerically, not as strings", () => {
    const facts = resolveRepoFacts({
      repoJson: REPO,
      releaseJson: { tag_name: "v1.9.0", published_at: "2026-10-30T18:41:14Z" },
      packageVersion: "1.10.0",
      buildDate: BUILD_DATE,
    });
    expect(facts.release?.version).toBe("1.10.0");
  });

  it("reports no release when the release payload is unusable, whatever the package says", () => {
    const facts = resolveRepoFacts({
      repoJson: REPO,
      releaseJson: { message: "API rate limit exceeded" },
      packageVersion: "1.4.0",
      buildDate: BUILD_DATE,
    });
    expect(facts.release).toBeNull();
    expect(facts.stars).toBe(74);
  });

  it("reports no stars when the repo payload is unusable", () => {
    const facts = resolveRepoFacts({
      repoJson: null,
      releaseJson: RELEASE,
      packageVersion: null,
      buildDate: BUILD_DATE,
    });
    expect(facts.stars).toBeNull();
    expect(facts.release?.version).toBe("1.4.0");
  });

  it("falls back to the facts stamped at publish when GitHub refuses the build", () => {
    const facts = resolveRepoFacts({
      repoJson: { message: "API rate limit exceeded" },
      releaseJson: { message: "API rate limit exceeded" },
      packageVersion: "2.11.4",
      buildDate: BUILD_DATE,
      stampedJson: { stars: 927, release: { version: "2.11.4", releasedOn: "2026-11-18" } },
    });
    expect(facts).toEqual({
      stars: 927,
      release: { version: "2.11.4", releasedOn: "2026-11-18" },
    });
  });

  it("prefers live GitHub facts over the stamped ones", () => {
    const facts = resolveRepoFacts({
      repoJson: { stargazers_count: 1000 },
      releaseJson: { tag_name: "v2.12.0", published_at: "2026-11-20T10:00:00Z" },
      packageVersion: "2.12.0",
      buildDate: BUILD_DATE,
      stampedJson: { stars: 927, release: { version: "2.11.4", releasedOn: "2026-11-18" } },
    });
    expect(facts).toEqual({
      stars: 1000,
      release: { version: "2.12.0", releasedOn: "2026-11-20" },
    });
  });

  it("keeps the stamped stars when a prerelease tag makes the stamped release unusable", () => {
    const facts = resolveRepoFacts({
      repoJson: null,
      releaseJson: null,
      packageVersion: null,
      buildDate: BUILD_DATE,
      stampedJson: { stars: 927, release: { version: "1.2.3-rc.1", releasedOn: "2026-11-18" } },
    });
    expect(facts).toEqual({ stars: 927, release: null });
  });

  it("ignores a malformed stamp", () => {
    const facts = resolveRepoFacts({
      repoJson: null,
      releaseJson: null,
      packageVersion: null,
      buildDate: BUILD_DATE,
      stampedJson: { stars: "lots", release: { version: "next" } },
    });
    expect(facts).toEqual({ stars: null, release: null });
  });
});
