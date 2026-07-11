import { describe, expect, it } from "vitest";
import { formatUserName } from "./formatUserName";

describe("formatUserName", () => {
  it("leaves real display names untouched", () => {
    expect(formatUserName("Ann Owner")).toBe("Ann Owner");
    expect(formatUserName("Carlos de la Cruz")).toBe("Carlos de la Cruz");
  });

  it("returns Unassigned for blank names", () => {
    expect(formatUserName("")).toBe("Unassigned");
    expect(formatUserName("   ")).toBe("Unassigned");
  });

  it("humanizes an email-shaped name into its local part", () => {
    expect(formatUserName("demo1@example.com")).toBe("Demo1");
    expect(formatUserName("jane.doe@acme.co")).toBe("Jane Doe");
  });

  it("humanizes local parts with underscores, hyphens, dots, and numbers", () => {
    expect(formatUserName("jane_doe_42@example.com")).toBe("Jane Doe 42");
    expect(formatUserName("ops-team.7@example.com")).toBe("Ops Team 7");
  });

  it("does not expose a raw email when whitespace wraps an email", () => {
    expect(formatUserName("  sam.owner@example.com  ")).toBe("Sam Owner");
  });
});
