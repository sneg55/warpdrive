import { describe, expect, it } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import type { OutcomeSummary } from "./fanOut";
import { noAnswerError } from "./outcomeClassification";

function summary(reasons: OutcomeSummary["reasons"]): OutcomeSummary {
  return { anySucceeded: false, reasons, earliestRetryIso: null };
}

describe("noAnswerError", () => {
  it("names the plan when every provider declined the lookup for one", () => {
    const error = noAnswerError(summary({ apollo: "not_entitled" }));
    expect(error.id).toBe(ERROR_IDS.ENRICH_NOT_ENTITLED);
  });

  it("still reports a real failure when one provider broke and another was not entitled", () => {
    const error = noAnswerError(summary({ apollo: "not_entitled", rocketreach: "provider_error" }));
    expect(error.id).toBe(ERROR_IDS.ENRICH_ALL_FAILED);
  });

  it("keeps an unreadable key ahead of a plan limit", () => {
    const error = noAnswerError(summary({ apollo: "not_entitled", rocketreach: "key_unreadable" }));
    expect(error.id).toBe(ERROR_IDS.ENRICH_KEY_UNREADABLE);
  });

  it("keeps a cooldown ahead of a plan limit, because only one of the two lifts", () => {
    const error = noAnswerError(summary({ apollo: "not_entitled", rocketreach: "throttled" }));
    expect(error.id).toBe(ERROR_IDS.ENRICH_THROTTLED);
  });
});
