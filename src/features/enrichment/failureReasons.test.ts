import { expect, it } from "vitest";
import { ENRICHMENT_STRINGS } from "@/constants/enrichmentStrings";
import { failureReasonsText } from "./failureReasons";

const O = ENRICHMENT_STRINGS.outcome;
const S = ENRICHMENT_STRINGS.dialog;

it("reads the per-provider reasons the server sent", () => {
  expect(failureReasonsText({ reasons: { apollo: "auth", rocketreach: "timeout" } })).toBe(
    [S.outcomeLine("apollo", O.auth), S.outcomeLine("rocketreach", O.timeout)].join(
      S.reasonSeparator,
    ),
  );
});

it("returns null when the context carries no reasons", () => {
  expect(failureReasonsText(undefined)).toBeNull();
  expect(failureReasonsText({})).toBeNull();
});

it("returns null when the reasons are not a map of strings", () => {
  expect(failureReasonsText({ reasons: "auth" })).toBeNull();
  expect(failureReasonsText({ reasons: null })).toBeNull();
  expect(failureReasonsText({ reasons: { apollo: 7 } })).toBeNull();
});

it("drops an outcome kind the strings file does not know", () => {
  expect(failureReasonsText({ reasons: { apollo: "exploded", rocketreach: "timeout" } })).toBe(
    S.outcomeLine("rocketreach", O.timeout),
  );
  expect(failureReasonsText({ reasons: { apollo: "exploded" } })).toBeNull();
});
