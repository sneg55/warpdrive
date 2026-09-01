import { expect, it } from "vitest";
import { validateMappedRow } from "./mapRow";

it("keeps the firmographics of an organization-target row through validation", () => {
  const result = validateMappedRow(
    "organization",
    {
      primary: {
        name: "New Jersey Transit Corporation",
        domain: "njtransit.com",
        employeeCount: "3431",
        customFields: {},
      },
    },
    [],
  );
  expect(result.ok).toBe(true);
  if (result.ok === true) {
    expect(result.value.primary.domain).toBe("njtransit.com");
    expect(result.value.primary.employeeCount).toBe(3431);
  }
});

it("omits unmapped organization fields rather than defaulting them to null", () => {
  const result = validateMappedRow(
    "organization",
    { primary: { name: "Chicago Transit Authority", customFields: {} } },
    [],
  );
  expect(result.ok).toBe(true);
  if (result.ok === true) {
    expect(result.value.primary).not.toHaveProperty("domain");
    expect(result.value.primary).not.toHaveProperty("industry");
    expect(result.value.primary).not.toHaveProperty("annualRevenue");
    expect(result.value.primary).not.toHaveProperty("address");
  }
});

it("omits unmapped fields from a related organization group too", () => {
  const result = validateMappedRow(
    "lead",
    { primary: { title: "L", customFields: {} }, organization: { name: "X" } },
    [],
  );
  expect(result.ok).toBe(true);
  if (result.ok === true) {
    expect(result.value.organization).toEqual({ name: "X" });
  }
});

it("rejects a lead source channel that is not an internal key", () => {
  const result = validateMappedRow(
    "lead",
    { primary: { title: "A lead", sourceChannel: "Outbound" } },
    [],
  );
  expect(result.ok).toBe(false);
  if (result.ok === false) {
    expect(result.errors.some((e) => e.field === "sourceChannel")).toBe(true);
  }
});

it("rejects a malformed email in a related person group", () => {
  const result = validateMappedRow(
    "deal",
    {
      primary: { title: "A deal", customFields: {} },
      person: { name: "Jane", emails: [{ label: "work", value: "not-an-email", primary: true }] },
    },
    [],
  );
  expect(result.ok).toBe(false);
  if (result.ok === false) {
    expect(result.errors.some((e) => e.field.startsWith("person."))).toBe(true);
  }
});

it("rejects a note body over the 50k limit", () => {
  const result = validateMappedRow(
    "lead",
    { primary: { title: "A lead" }, note: { body: "x".repeat(50_001) } },
    [],
  );
  expect(result.ok).toBe(false);
  if (result.ok === false)
    expect(result.errors.some((e) => e.field.startsWith("note."))).toBe(true);
});
