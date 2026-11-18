import { describe, expect, it } from "vitest";
import { primaryCounterparty } from "./primaryCounterparty";

type Msg = Parameters<typeof primaryCounterparty>[0][number];

const inbound = (fromEmail: string, fromName: string | null = null): Msg => ({
  direction: "inbound",
  fromEmail,
  fromName,
  toEmails: [],
});
const outbound = (toEmails: string[]): Msg => ({
  direction: "outbound",
  fromEmail: "me@acme.com",
  fromName: "Me",
  toEmails,
});

describe("primaryCounterparty", () => {
  it("prefers an inbound sender (the other party wrote it)", () => {
    const out = primaryCounterparty(
      [outbound(["ada@client.com"]), inbound("ada@client.com", "Ada Client")],
      "me@acme.com",
    );
    expect(out).toEqual({ email: "ada@client.com", name: "Ada Client" });
  });

  it("uses the recipient on an outbound-only thread (never the owner)", () => {
    const out = primaryCounterparty([outbound(["ada@client.com"])], "me@acme.com");
    expect(out).toEqual({ email: "ada@client.com", name: null });
  });

  it("skips the owner's own address among recipients", () => {
    const out = primaryCounterparty([outbound(["me@acme.com", "ada@client.com"])], "me@acme.com");
    expect(out).toEqual({ email: "ada@client.com", name: null });
  });

  it("is case-insensitive about the owner address", () => {
    const out = primaryCounterparty([inbound("ada@client.com", "Ada")], "ME@ACME.COM");
    expect(out).toEqual({ email: "ada@client.com", name: "Ada" });
  });

  it("returns null when only the owner appears", () => {
    expect(primaryCounterparty([outbound(["me@acme.com"])], "me@acme.com")).toBeNull();
  });

  it("returns null for a null owner email with no inbound", () => {
    expect(primaryCounterparty([outbound(["ada@client.com"])], null)).toEqual({
      email: "ada@client.com",
      name: null,
    });
  });
});
