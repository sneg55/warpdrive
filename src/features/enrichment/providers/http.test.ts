import { describe, expect, it } from "vitest";
import { classifyStatus, parseRetryAfter, pickNumber, pickString } from "./http";

const NOW = new Date("2026-08-24T12:00:00.000Z");

describe("classifyStatus", () => {
  it("treats 2xx as ok", () => {
    expect(classifyStatus(200, "", new Headers()).kind).toBe("ok");
  });

  it("treats 401 and 403 as an auth failure", () => {
    expect(classifyStatus(401, "", new Headers()).kind).toBe("auth");
    expect(classifyStatus(403, "", new Headers()).kind).toBe("auth");
  });

  it("treats 429 as throttled and carries retry-after through", () => {
    const out = classifyStatus(429, "", new Headers({ "retry-after": "90" }), NOW);
    expect(out.kind).toBe("throttled");
    expect(out.retryAfterIso).toBe("2026-08-24T12:01:30.000Z");
  });

  it("falls back to a 15 minute cooldown when 429 carries no retry-after", () => {
    const out = classifyStatus(429, "", new Headers(), NOW);
    expect(out.kind).toBe("throttled");
    expect(out.retryAfterIso).toBe("2026-08-24T12:15:00.000Z");
  });

  it("reads credit exhaustion out of a 4xx body and cools down for 24 hours", () => {
    const out = classifyStatus(402, "You are out of credits", new Headers(), NOW);
    expect(out.kind).toBe("quota");
    expect(out.retryAfterIso).toBe("2026-08-25T12:00:00.000Z");
  });

  it("recognises credit exhaustion regardless of wording or case", () => {
    expect(classifyStatus(403, "Insufficient Credits remaining", new Headers(), NOW).kind).toBe(
      "quota",
    );
    expect(classifyStatus(400, "credit balance exhausted", new Headers(), NOW).kind).toBe("quota");
  });

  it("reads a plan that does not include the endpoint out of a 403", () => {
    const body = JSON.stringify({
      error:
        "The api/v1/people/match API is not included in your Professional (Trial) plan and is not accessible, even with a master key. All paid plans include full API access. Upgrade your plan from https://www.apollo.io/pricing",
      error_code: "API_INACCESSIBLE",
    });
    const out = classifyStatus(403, body, new Headers(), NOW);
    expect(out.kind).toBe("not_entitled");
    expect(out.retryAfterIso).toBeUndefined();
  });

  it("still reads credit exhaustion when a 403 also mentions the plan", () => {
    const body = "Your plan is out of credits. Upgrade your plan.";
    expect(classifyStatus(403, body, new Headers(), NOW).kind).toBe("quota");
  });

  it("treats any other non-2xx as a provider error", () => {
    expect(classifyStatus(500, "boom", new Headers()).kind).toBe("provider_error");
    expect(classifyStatus(404, "nope", new Headers()).kind).toBe("provider_error");
  });

  it("never leaks the response body into the message", () => {
    const out = classifyStatus(500, "x-api-key: sk-secret-value", new Headers());
    expect(out.message ?? "").not.toContain("sk-secret-value");
  });
});

describe("parseRetryAfter", () => {
  it("reads a delay in seconds", () => {
    expect(parseRetryAfter("30", NOW)).toBe("2026-08-24T12:00:30.000Z");
  });

  it("reads an HTTP date", () => {
    expect(parseRetryAfter("Mon, 24 Aug 2026 12:05:00 GMT", NOW)).toBe("2026-08-24T12:05:00.000Z");
  });

  it("returns undefined for junk", () => {
    expect(parseRetryAfter("soon", NOW)).toBeUndefined();
    expect(parseRetryAfter(null, NOW)).toBeUndefined();
  });

  it("ignores a negative delay rather than producing a past deadline", () => {
    expect(parseRetryAfter("-10", NOW)).toBeUndefined();
  });

  // A delay past the Date range makes toISOString throw RangeError, which would turn a handled
  // throttle into an unhandled exception and defeat the graceful degradation this exists for.
  it("ignores a delay beyond the representable date range", () => {
    expect(parseRetryAfter("99999999999999999999", NOW)).toBeUndefined();
    expect(() =>
      classifyStatus(429, "", new Headers({ "retry-after": "1e21" }), NOW),
    ).not.toThrow();
  });

  it("still falls back to the cooldown when retry-after is out of range", () => {
    const out = classifyStatus(
      429,
      "",
      new Headers({ "retry-after": "99999999999999999999" }),
      NOW,
    );
    expect(out.retryAfterIso).toBe("2026-08-24T12:15:00.000Z");
  });
});

describe("field pickers", () => {
  it("returns a trimmed non-empty string or undefined", () => {
    expect(pickString("  hi  ")).toBe("hi");
    expect(pickString("   ")).toBeUndefined();
    expect(pickString(null)).toBeUndefined();
    expect(pickString(42)).toBeUndefined();
  });

  it("returns a finite number, coercing numeric strings", () => {
    expect(pickNumber(240)).toBe(240);
    expect(pickNumber("240")).toBe(240);
    expect(pickNumber("1,240")).toBe(1240);
    expect(pickNumber("not a number")).toBeUndefined();
    expect(pickNumber(Number.POSITIVE_INFINITY)).toBeUndefined();
    expect(pickNumber(null)).toBeUndefined();
  });
});
