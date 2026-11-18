import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MAX_EMAIL_LEN, MAX_PHONE_LEN } from "./fieldBounds";

describe("contacts field bounds", () => {
  it("caps email at the RFC 5321 length", () => {
    expect(MAX_EMAIL_LEN).toBe(320);
  });

  it("caps phone length", () => {
    expect(MAX_PHONE_LEN).toBe(40);
  });

  it("does not import zod", () => {
    const src = readFileSync(fileURLToPath(new URL("./fieldBounds.ts", import.meta.url)), "utf8");
    expect(src).not.toMatch(/from ["']zod["']/);
  });
});
