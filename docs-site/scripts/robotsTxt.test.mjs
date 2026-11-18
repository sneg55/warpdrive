import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const robots = readFileSync(new URL("../static/robots.txt", import.meta.url), "utf8");
const DOCS_SITEMAP_LINE = "Sitemap: https://docs.warpdrivecrm.com/sitemap.xml";
const AI_AGENTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
];

function allowsAll(agent) {
  return robots.includes(`User-agent: ${agent}\nAllow: /\n`);
}

describe("docs robots.txt", () => {
  it("points crawlers at the docs sitemap", () => {
    assert.ok(robots.split("\n").includes(DOCS_SITEMAP_LINE));
  });

  it("allows every crawler and names each AI agent explicitly", () => {
    assert.ok(allowsAll("*"));
    for (const agent of AI_AGENTS) assert.ok(allowsAll(agent), agent);
  });

  it("disallows nothing", () => {
    assert.ok(!robots.includes("Disallow"));
  });
});
