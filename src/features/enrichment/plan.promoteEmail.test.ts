// Promoting an enriched address. updatePerson re-derives primary_email from the array it is given
// (derivePrimaryEmail takes the first entry flagged primary, else the first entry), so a promotion
// is expressed by moving the flag, never by patching the column.
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

  // The old address is demoted, never dropped: enrichment does not get to delete what a colleague
  // typed, and a wrong promotion has to stay recoverable from the record itself.
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
    // An entry that never carried the flag must not gain a false one: it would rewrite a point
    // enrichment did not touch, and derivePrimaryEmail reads the first flagged entry either way.
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

  // A promotion replaces which address the record answers to, so the change log has to show the
  // address that was displaced. A plain add has no previous value and stays an append.
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

  // The patch guard folds an address before deciding it is one the record already held, so this
  // comparison has to fold too. Otherwise a stored "broken@ " and a provider's "broken@" read as
  // two different addresses here and as the same one there, and the second is written as held
  // without ever facing the address rule.
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

  // The merge drops an unusable value from the preview, but applyEnrichment checks a selection
  // against the run's RAW outcomes, so a direct action request can name one the preview never
  // offered. A custom-mapped target reaches the write through custom-field validation, which has
  // no notion of an address, so the plan is the last place that can refuse it.
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
