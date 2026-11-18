// @vitest-environment jsdom
import { getConfig } from "@testing-library/react";
import { describe, expect, it } from "vitest";

const CI_TOLERANT_MS = 5_000;

describe("vitest setup", () => {
  it("gives async queries a budget the CI runner can actually meet", () => {
    expect(getConfig().asyncUtilTimeout).toBeGreaterThanOrEqual(CI_TOLERANT_MS);
  });
});
