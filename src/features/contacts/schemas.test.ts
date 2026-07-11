import { describe, expect, it } from "vitest";
import { emailPointSchema, personCreateInput, phonePointSchema } from "./schemas";

describe("emailPointSchema", () => {
  it("rejects a non-email value", () => {
    expect(emailPointSchema.safeParse({ label: "work", value: "abc" }).success).toBe(false);
  });

  it("rejects an over-long value", () => {
    const long = `${"a".repeat(320)}@x.com`;
    expect(emailPointSchema.safeParse({ label: "work", value: long }).success).toBe(false);
  });

  it("accepts a valid email", () => {
    expect(emailPointSchema.safeParse({ label: "work", value: "a@b.com" }).success).toBe(true);
  });
});

describe("phonePointSchema", () => {
  it("rejects a value with letters", () => {
    expect(phonePointSchema.safeParse({ label: "work", value: "call-me" }).success).toBe(false);
  });

  it("accepts a formatted phone number", () => {
    expect(phonePointSchema.safeParse({ label: "work", value: "+1 (555) 010-0100" }).success).toBe(
      true,
    );
  });

  it("accepts a dot-separated phone number", () => {
    expect(phonePointSchema.safeParse({ label: "work", value: "555.123.4567" }).success).toBe(true);
  });

  it("rejects a value with no digits", () => {
    expect(phonePointSchema.safeParse({ label: "work", value: "()" }).success).toBe(false);
  });
});

describe("personCreateInput enforces email/phone formats", () => {
  it("rejects a malformed email in the emails array", () => {
    const r = personCreateInput.safeParse({
      name: "Jane",
      emails: [{ label: "work", value: "nope" }],
    });
    expect(r.success).toBe(false);
  });
});

describe("personCreateInput trims firstName/lastName", () => {
  it("trims surrounding whitespace from firstName/lastName", () => {
    const r = personCreateInput.safeParse({
      name: "Jane Doe",
      firstName: "  Jane  ",
      lastName: "  Doe  ",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.firstName).toBe("Jane");
      expect(r.data.lastName).toBe("Doe");
    }
  });

  it("reduces a whitespace-only firstName/lastName to an empty string instead of persisting the whitespace", () => {
    const r = personCreateInput.safeParse({ name: "Jane", firstName: "   ", lastName: "\t" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.firstName).toBe("");
      expect(r.data.lastName).toBe("");
    }
  });
});
