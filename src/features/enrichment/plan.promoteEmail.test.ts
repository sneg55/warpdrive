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
];

const CURRENT = { customFieldKeyById: new Map<string, string>() };

const PROMOTE = [{ canonicalKey: "person.email", value: "jane@acme.com", makePrimary: true }];
const ALONGSIDE = [{ canonicalKey: "person.email", value: "jane@acme.com" }];

describe("planPersonUpdate promoting an enriched address", () => {
  it("moves the primary flag off the address the record promoted", () => {
    const r = planPersonUpdate(PROMOTE, MAPPINGS, {
      ...CURRENT,
      emails: [{ label: "work", value: "broken@", primary: true }],
      primaryEmail: "broken@",
    });
    expect(r.ok && r.value.patch.emails).toEqual([
      { label: "work", value: "broken@", primary: false },
      { label: "work", value: "jane@acme.com", primary: true },
    ]);
  });

  it("keeps the demoted address on the record", () => {
    const r = planPersonUpdate(PROMOTE, MAPPINGS, {
      ...CURRENT,
      emails: [
        { label: "work", value: "broken@", primary: true },
        { label: "home", value: "spare@acme.com" },
      ],
      primaryEmail: "broken@",
    });
    const emails = r.ok ? r.value.patch.emails : [];
    expect(emails?.map((e) => e.value)).toEqual(["broken@", "spare@acme.com", "jane@acme.com"]);
    expect(emails?.filter((e) => e.primary === true).map((e) => e.value)).toEqual([
      "jane@acme.com",
    ]);
    expect(emails?.[1]).toEqual({ label: "home", value: "spare@acme.com" });
  });

  it("leaves the existing primary alone when the value is only added alongside", () => {
    const r = planPersonUpdate(ALONGSIDE, MAPPINGS, {
      ...CURRENT,
      emails: [{ label: "work", value: "old@acme.com", primary: true }],
      primaryEmail: "old@acme.com",
    });
    expect(r.ok && r.value.patch.emails).toEqual([
      { label: "work", value: "old@acme.com", primary: true },
      { label: "work", value: "jane@acme.com", primary: false },
    ]);
  });

  it("reports a promotion as replacing rather than appending", () => {
    const promoted = planPersonUpdate(PROMOTE, MAPPINGS, {
      ...CURRENT,
      emails: [{ label: "work", value: "broken@", primary: true }],
      primaryEmail: "broken@",
    });
    expect(promoted.ok && promoted.value.appendedFields).toEqual([]);

    const added = planPersonUpdate(ALONGSIDE, MAPPINGS, {
      ...CURRENT,
      emails: [{ label: "work", value: "old@acme.com", primary: true }],
      primaryEmail: "old@acme.com",
    });
    expect(added.ok && added.value.appendedFields).toEqual(["person.email"]);
  });

  it("recognises a stored address that differs only by surrounding space", () => {
    const r = planPersonUpdate(
      [{ canonicalKey: "person.email", value: "jane@acme.com" }],
      MAPPINGS,
      {
        ...CURRENT,
        emails: [{ label: "work", value: " jane@acme.com ", primary: true }],
      },
    );
    expect(r.ok && r.value.patch.emails).toBeUndefined();
    expect(r.ok && r.value.appliedFields).toEqual([]);
  });

  it("refuses a selection whose value breaks the field's rule", () => {
    const r = planPersonUpdate(
      [{ canonicalKey: "person.email", value: "also-broken@" }],
      MAPPINGS,
      { ...CURRENT, emails: [], primaryEmail: null },
    );
    expect(r.ok).toBe(false);
  });

  it("promotes into an empty record without inventing a demotion", () => {
    const r = planPersonUpdate(PROMOTE, MAPPINGS, {
      ...CURRENT,
      emails: [],
      primaryEmail: null,
    });
    expect(r.ok && r.value.patch.emails).toEqual([
      { label: "work", value: "jane@acme.com", primary: true },
    ]);
  });
});
