import { describe, expect, it } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import type { OutcomeKind, ProviderId, ProviderOutcome } from "../providers/types";
import { messageForErrorId, messageForOutcome } from "./searchMessage";

function outcomeOf(kind: OutcomeKind, provider: ProviderId, message?: string): ProviderOutcome {
  return message === undefined ? { provider, kind } : { provider, kind, message };
}

describe("messageForErrorId", () => {
  it("tells the user to add a domain when the organization has none", () => {
    expect(messageForErrorId(ERROR_IDS.ENRICH_ORG_NO_DOMAIN, "Acme").title).toBe(
      "This organization has no domain",
    );
  });

  it("points at settings when nothing connected can search", () => {
    expect(messageForErrorId(ERROR_IDS.ENRICH_NO_SEARCH_PROVIDER, "Acme").body).toContain(
      "Settings",
    );
  });

  it("never renders an unmapped failure as an empty result", () => {
    const message = messageForErrorId(ERROR_IDS.DB_INSERT_FAILED, "Acme");
    expect(message.body.length).toBeGreaterThan(0);
    expect(message.body).not.toBe("");
  });
});

describe("messageForOutcome", () => {
  it("returns nothing to show for a successful search", () => {
    expect(messageForOutcome(outcomeOf("ok", "apollo"), "Acme")).toBeNull();
  });

  it("names the company in the empty state rather than showing a blank panel", () => {
    expect(messageForOutcome(outcomeOf("no_match", "apollo"), "Acme")?.title).toBe(
      "No people found at Acme",
    );
  });

  it("names the provider whose plan excludes search", () => {
    expect(messageForOutcome(outcomeOf("not_entitled", "apollo"), "Acme")?.body).toContain(
      "Apollo",
    );
  });

  it("distinguishes a rate limit from an empty result", () => {
    expect(messageForOutcome(outcomeOf("throttled", "rocketreach"), "Acme")?.body).toContain(
      "rate limited",
    );
  });

  it("treats a bad key as a configuration problem, not an empty result", () => {
    expect(messageForOutcome(outcomeOf("auth", "apollo"), "Acme")?.body).toContain("API key");
  });

  it("shows a message for every failure kind", () => {
    const kinds = [
      "no_match",
      "auth",
      "throttled",
      "quota",
      "timeout",
      "provider_error",
      "skipped",
      "unsupported",
      "key_unreadable",
      "not_entitled",
    ] as const;
    for (const kind of kinds) {
      expect(messageForOutcome(outcomeOf(kind, "apollo"), "Acme")).not.toBeNull();
    }
  });
});

describe("messageForOutcome provider detail", () => {
  it("names what the provider actually returned so a failure is diagnosable", () => {
    const message = messageForOutcome(
      outcomeOf("provider_error", "apollo", "Provider returned 422"),
      "Acme",
    );
    expect(message?.body).toContain("Provider returned 422");
  });

  it("leaves the mapped kinds alone rather than appending a duplicate detail", () => {
    const message = messageForOutcome(
      outcomeOf("not_entitled", "apollo", "Provider plan does not include this lookup"),
      "Acme",
    );
    expect(message?.body).toContain("Apollo");
    expect(message?.body).not.toContain("does not include this lookup");
  });
});
