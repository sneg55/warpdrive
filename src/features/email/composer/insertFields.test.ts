// insertFields.test.ts: unit tests for the insertFields catalogue (Task 4.4)
// Item 10a: use exported INSERT_FIELD_LABELS constants instead of hardcoded strings.
import { describe, expect, it } from "vitest";
import { INSERT_FIELD_LABELS, insertFields } from "./insertFields";

describe("insertFields - inbox context", () => {
  it("returns an empty array for inbox context (no deal data)", () => {
    const fields = insertFields({ kind: "inbox" });
    expect(fields).toEqual([]);
  });
});

describe("insertFields - deal context", () => {
  const context = {
    kind: "deal" as const,
    dealId: "d1",
    dealTitle: "Acme Deal",
    dealValue: "50000",
    personFirstName: "Sofia",
    personLastName: "Loren",
    personEmail: "sofia@acme.com",
    orgName: "Acme Corp",
  };

  it("includes Deal title with the resolved value", () => {
    const fields = insertFields(context);
    const field = fields.find((f) => f.label === INSERT_FIELD_LABELS.DEAL_TITLE);
    expect(field).toBeDefined();
    expect(field?.value).toBe("Acme Deal");
  });

  it("includes Deal value with the resolved value", () => {
    const fields = insertFields(context);
    const field = fields.find((f) => f.label === INSERT_FIELD_LABELS.DEAL_VALUE);
    expect(field).toBeDefined();
    expect(field?.value).toBe("50000");
  });

  it("includes First name with the resolved value", () => {
    const fields = insertFields(context);
    const field = fields.find((f) => f.label === INSERT_FIELD_LABELS.FIRST_NAME);
    expect(field).toBeDefined();
    expect(field?.value).toBe("Sofia");
  });

  it("includes Last name with the resolved value", () => {
    const fields = insertFields(context);
    const field = fields.find((f) => f.label === INSERT_FIELD_LABELS.LAST_NAME);
    expect(field).toBeDefined();
    expect(field?.value).toBe("Loren");
  });

  it("includes Contact email with the resolved value", () => {
    const fields = insertFields(context);
    const field = fields.find((f) => f.label === INSERT_FIELD_LABELS.CONTACT_EMAIL);
    expect(field).toBeDefined();
    expect(field?.value).toBe("sofia@acme.com");
  });

  it("includes Organization name with the resolved value", () => {
    const fields = insertFields(context);
    const field = fields.find((f) => f.label === INSERT_FIELD_LABELS.ORG_NAME);
    expect(field).toBeDefined();
    expect(field?.value).toBe("Acme Corp");
  });

  it("omits fields with no value (undefined context properties)", () => {
    const minimalContext = {
      kind: "deal" as const,
      dealId: "d1",
      dealTitle: "My Deal",
    };
    const fields = insertFields(minimalContext);
    // dealTitle should appear, but person/org fields should not (no data)
    expect(fields.find((f) => f.label === INSERT_FIELD_LABELS.DEAL_TITLE)).toBeDefined();
    expect(fields.find((f) => f.label === INSERT_FIELD_LABELS.FIRST_NAME)).toBeUndefined();
    expect(fields.find((f) => f.label === INSERT_FIELD_LABELS.ORG_NAME)).toBeUndefined();
  });
});
