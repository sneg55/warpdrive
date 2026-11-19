import { describe, expect, it } from "vitest";
import { buildSnippet } from "./snippet";

describe("buildSnippet", () => {
  it("returns short text untouched", () => {
    expect(buildSnippet("code PROPDESK here", "propdesk", 40)).toBe("code PROPDESK here");
  });

  it("windows around the first match with ellipses on both cut sides", () => {
    const text = `${"a".repeat(50)} needle ${"b".repeat(50)}`;
    const s = buildSnippet(text, "needle", 20);
    expect(s.startsWith("…")).toBe(true);
    expect(s.endsWith("…")).toBe(true);
    expect(s).toContain("needle");
  });

  it("has no left ellipsis when the match is near the start", () => {
    const text = `needle ${"b".repeat(100)}`;
    const s = buildSnippet(text, "needle", 20);
    expect(s.startsWith("needle")).toBe(true);
    expect(s.endsWith("…")).toBe(true);
  });

  it("has no right ellipsis when the match is near the end", () => {
    const text = `${"a".repeat(100)} needle`;
    const s = buildSnippet(text, "needle", 20);
    expect(s.startsWith("…")).toBe(true);
    expect(s.endsWith("needle")).toBe(true);
  });

  it("collapses whitespace and matches case-insensitively", () => {
    expect(buildSnippet("Hello\n\n  World", "WORLD", 40)).toBe("Hello World");
  });

  it("falls back to the start of the text when the query is not found", () => {
    const s = buildSnippet("x".repeat(100), "zzz", 10);
    expect(s).toBe(`${"x".repeat(10)}…`);
  });
});
