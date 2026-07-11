import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MAX_EMAIL_LEN, MAX_PHONE_LEN } from "./fieldBounds";

// The contact edit forms and the deal quick-add person column (both client components) read
// MAX_EMAIL_LEN / MAX_PHONE_LEN for their input maxLength hints. These bounds live in a zod-free
// module so importing a plain number does not drag zod (~62 KB gzipped) into those client
// bundles. contacts/schemas.ts re-exports them and applies them in its zod field validators, so
// the client hint and the server cap stay identical.
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
