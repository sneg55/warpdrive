import { describe, expect, test } from "vitest";
import { GRAVATAR_SIZE, gravatarUrl, isGravatarUrl } from "./gravatar";

describe("isGravatarUrl", () => {
  test("recognizes a URL built by gravatarUrl", () => {
    expect(isGravatarUrl(gravatarUrl("admin@example.com"))).toBe(true);
  });

  test("rejects other avatar URLs and null", () => {
    expect(isGravatarUrl("https://pics.example.com/a.png")).toBe(false);
    expect(isGravatarUrl("https://gravatar.com.evil.example/avatar/x")).toBe(false);
    expect(isGravatarUrl(null)).toBe(false);
  });
});

describe("gravatarUrl", () => {
  test("builds the canonical URL from the SHA-256 of the normalized email", () => {
    expect(gravatarUrl("admin@example.com")).toBe(
      `https://gravatar.com/avatar/258d8dc916db8cea2cafb6c3cd0cb0246efe061421dbd83ec3a350428cabda4f?d=identicon&s=${GRAVATAR_SIZE}`,
    );
  });

  test("normalizes case and surrounding whitespace before hashing", () => {
    expect(gravatarUrl("  Admin@Example.COM ")).toBe(gravatarUrl("admin@example.com"));
  });

  test("always requests a guaranteed image so a missing profile never 404s", () => {
    expect(gravatarUrl("nobody@example.com")).toContain("d=identicon");
  });
});
