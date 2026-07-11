import { describe, expect, it } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import { dealActionErrorContent } from "./dealActionError";

describe("dealActionErrorContent", () => {
  it("explains a permission denial as an ownership problem", () => {
    const { title, body } = dealActionErrorContent(ERROR_IDS.PERM_DENIED);
    expect(title).toMatch(/permission/i);
    expect(body).toMatch(/owner/i);
  });

  it("explains a stale compare-and-swap as a concurrent change", () => {
    const { body } = dealActionErrorContent(ERROR_IDS.DEAL_PRECONDITION);
    expect(body).toMatch(/changed/i);
  });

  it("explains a dead session as needing re-auth", () => {
    const { body } = dealActionErrorContent(ERROR_IDS.AUTH_SESSION_DEAD);
    expect(body).toMatch(/sign in|session/i);
  });

  it("falls back to a generic message for an unknown id", () => {
    const { title, body } = dealActionErrorContent("E_SOMETHING_UNKNOWN");
    expect(title.length).toBeGreaterThan(0);
    expect(body.length).toBeGreaterThan(0);
  });

  it("falls back to a generic message when no id is given", () => {
    const { body } = dealActionErrorContent();
    expect(body.length).toBeGreaterThan(0);
  });
});
