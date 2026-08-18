// @vitest-environment jsdom
import { getConfig } from "@testing-library/react";
import { describe, expect, it } from "vitest";

// Testing Library's async utils default to a 1000ms budget, which is generous on a developer
// machine and marginal on the CI runner, where the suite runs 23 workers inside one shared pod.
// Three separate suites failed the gate on 2026-08-18 for that reason alone, none of them a real
// regression: two waited on a next/dynamic component (ColumnsMenu's draggable list, the composer's
// RichTextBody) and one on a Radix tooltip, whose own open delay eats most of the 1000ms before the
// query even starts. The budget is a ceiling, not a sleep, so raising it costs a passing test
// nothing and only buys a slow one room to settle.
const CI_TOLERANT_MS = 5_000;

describe("vitest setup", () => {
  it("gives async queries a budget the CI runner can actually meet", () => {
    expect(getConfig().asyncUtilTimeout).toBeGreaterThanOrEqual(CI_TOLERANT_MS);
  });
});
