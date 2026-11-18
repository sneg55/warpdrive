import { expect, it } from "vitest";
import { agenticConnectSchema } from "./agenticConnectSchema";

const base = {
  baseUrl: "https://inbox.example.com/",
  address: "  Media@Example.com ",
  clientId: "cid",
  clientSecret: "secret",
  displayName: "Media",
  backfillDays: 90,
};

it("accepts https, trims and lowercases the address and strips the trailing slash", () => {
  const r = agenticConnectSchema.safeParse(base);
  expect(r.success ? r.data : null).toMatchObject({
    baseUrl: "https://inbox.example.com",
    address: "media@example.com",
  });
});

it("allows http only for localhost and 127.0.0.1", () => {
  const ok = (baseUrl: string) => agenticConnectSchema.safeParse({ ...base, baseUrl }).success;
  expect(ok("http://localhost:8787")).toBe(true);
  expect(ok("http://127.0.0.1:8787")).toBe(true);
  expect(ok("http://inbox.example.com")).toBe(false);
  expect(ok("ftp://inbox.example.com")).toBe(false);
  expect(ok("not a url")).toBe(false);
});

it("rejects a backfill window outside the offered choices", () => {
  expect(agenticConnectSchema.safeParse({ ...base, backfillDays: 7 }).success).toBe(false);
  expect(agenticConnectSchema.safeParse({ ...base, backfillDays: 0 }).success).toBe(true);
});
