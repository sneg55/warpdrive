import { describe, expect, it } from "vitest";
import { LANDING_STRINGS } from "@/constants/landingStrings";
import { SITE_PAGES } from "@/constants/sitePages";
import { buildLlmsTxt } from "./buildLlmsTxt";

const RELEASE = { version: "1.4.0", releasedOn: "2026-10-30" };

describe("buildLlmsTxt", () => {
  it("opens with the project name and a one-line summary blockquote", () => {
    const [title, blank, summary] = buildLlmsTxt(RELEASE).split("\n");
    expect(title).toBe("# Warpdrive");
    expect(blank).toBe("");
    expect(summary).toMatch(/^> .*Pipedrive alternative/);
  });

  it("links every site page with its description", () => {
    const text = buildLlmsTxt(RELEASE);
    for (const page of SITE_PAGES) {
      expect(text).toContain(page.description);
      expect(text).toContain(`(https://warpdrivecrm.com${page.path === "/" ? "" : page.path})`);
    }
  });

  it("points at the docs index and the source repository", () => {
    const text = buildLlmsTxt(RELEASE);
    expect(text).toContain("(https://docs.warpdrivecrm.com/llms.txt)");
    expect(text).toContain(`(${LANDING_STRINGS.hero.ctaHref})`);
  });

  it("states the latest release when known and leaves it out otherwise", () => {
    expect(buildLlmsTxt(RELEASE)).toContain("Latest release: v1.4.0 (2026-10-30)");
    expect(buildLlmsTxt(null)).not.toContain("Latest release");
  });

  it("carries every FAQ answer", () => {
    const text = buildLlmsTxt(null);
    for (const item of LANDING_STRINGS.faq.items) {
      expect(text).toContain(`### ${item.q}`);
      expect(text).toContain(item.a);
    }
  });
});
