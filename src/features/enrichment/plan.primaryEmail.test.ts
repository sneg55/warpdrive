import { describe, expect, it } from "vitest";
import { planPersonUpdate } from "./plan";
import type { ResolvedMapping } from "./types";

const MAPPINGS: ResolvedMapping[] = [
  {
    canonicalKey: "person.email",
    label: "person.email",
    targetKind: "builtin",
    targetKey: "emails",
    targetFieldDefId: null,
  },
  {
    canonicalKey: "person.title",
    label: "person.title",
    targetKind: "custom",
    targetKey: null,
    targetFieldDefId: "def-title",
  },
];

const CURRENT = {
  emails: [] as { label: string; value: string; primary?: boolean }[],
  customFieldKeyById: new Map([["def-title", "job_title"]]),
};

const ADD_JANE = [{ canonicalKey: "person.email", value: "jane@acme.com" }];

describe("planPersonUpdate primary email", () => {
  it("keeps a standalone primary the emails array does not carry", () => {
    const r = planPersonUpdate(ADD_JANE, MAPPINGS, {
      ...CURRENT,
      emails: [],
      primaryEmail: "old@acme.com",
    });
    expect(r.ok && r.value.patch.emails).toEqual([
      { label: "work", value: "old@acme.com", primary: true },
      { label: "work", value: "jane@acme.com", primary: false },
    ]);
  });

  it("keeps the standalone primary ahead of addresses no entry flags as primary", () => {
    const r = planPersonUpdate(ADD_JANE, MAPPINGS, {
      ...CURRENT,
      emails: [{ label: "home", value: "other@acme.com" }],
      primaryEmail: "old@acme.com",
    });
    expect(r.ok && r.value.patch.emails).toEqual([
      { label: "work", value: "old@acme.com", primary: true },
      { label: "home", value: "other@acme.com" },
      { label: "work", value: "jane@acme.com", primary: false },
    ]);
  });

  it("does not duplicate a primary the array already carries, in any casing", () => {
    const r = planPersonUpdate(ADD_JANE, MAPPINGS, {
      ...CURRENT,
      emails: [{ label: "work", value: "Old@acme.com", primary: true }],
      primaryEmail: "old@acme.com",
    });
    expect(r.ok && r.value.patch.emails).toEqual([
      { label: "work", value: "Old@acme.com", primary: true },
      { label: "work", value: "jane@acme.com", primary: false },
    ]);
  });

  it("adds nothing when the proposed address is the standalone primary itself", () => {
    const r = planPersonUpdate(
      [{ canonicalKey: "person.email", value: "OLD@acme.com" }],
      MAPPINGS,
      {
        ...CURRENT,
        emails: [],
        primaryEmail: "old@acme.com",
      },
    );
    expect(r.ok && r.value.patch.emails).toBeUndefined();
    expect(r.ok && r.value.appliedFields).toEqual([]);
  });

  it("leaves the emails out of the patch when nothing writes to them", () => {
    const r = planPersonUpdate([{ canonicalKey: "person.title", value: "CTO" }], MAPPINGS, {
      ...CURRENT,
      emails: [],
      primaryEmail: "old@acme.com",
    });
    expect(r.ok && r.value.patch.emails).toBeUndefined();
  });

  it("still makes the enriched address primary when the person has no email at all", () => {
    const r = planPersonUpdate(ADD_JANE, MAPPINGS, { ...CURRENT, emails: [], primaryEmail: null });
    expect(r.ok && r.value.patch.emails).toEqual([
      { label: "work", value: "jane@acme.com", primary: true },
    ]);
  });
});

const COMPANY: ResolvedMapping[] = [
  {
    canonicalKey: "person.companyName",
    label: "person.companyName",
    targetKind: "builtin",
    targetKey: "org",
    targetFieldDefId: null,
  },
];
const PICK_ACME = [{ canonicalKey: "person.companyName", value: "Acme" }];

describe("planPersonUpdate resolvedEmails", () => {
  it("carries the standalone primary even when no email was selected", () => {
    const r = planPersonUpdate(PICK_ACME, COMPANY, {
      ...CURRENT,
      emails: [],
      primaryEmail: "jane@acme.com",
    });
    expect(r.ok && r.value.resolvedEmails).toEqual([
      { label: "work", value: "jane@acme.com", primary: true },
    ]);
    expect(r.ok && "emails" in r.value.patch).toBe(false);
  });

  it("leaves emails out of the patch when the array already holds the primary", () => {
    const r = planPersonUpdate(PICK_ACME, COMPANY, {
      ...CURRENT,
      emails: [{ label: "work", value: "jane@acme.com", primary: true }],
      primaryEmail: "jane@acme.com",
    });
    expect(r.ok && r.value.resolvedEmails).toEqual([
      { label: "work", value: "jane@acme.com", primary: true },
    ]);
  });

  it("reports an empty array when there is no primary to rescue", () => {
    const r = planPersonUpdate(PICK_ACME, COMPANY, { ...CURRENT, emails: [], primaryEmail: null });
    expect(r.ok && r.value.resolvedEmails).toEqual([]);
  });
});
