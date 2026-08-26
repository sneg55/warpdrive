import { describe, expect, it } from "vitest";
import { mergeCandidates } from "./merge";
import type { ProviderOutcome } from "./providers/types";
import type { ResolvedMapping } from "./types";

const EMAIL: ResolvedMapping = {
  canonicalKey: "person.email",
  label: "Email",
  targetKind: "builtin",
  targetKey: "emails",
  targetFieldDefId: null,
};

const TITLE: ResolvedMapping = {
  canonicalKey: "person.title",
  label: "Job title",
  targetKind: "custom",
  targetKey: null,
  targetFieldDefId: "def-title",
};

function outcome(fields: Record<string, string | number>): ProviderOutcome {
  return { provider: "apollo", kind: "ok", candidate: { fields } };
}

describe("mergeCandidates, replacing a broken value", () => {
  it("checks an overwrite by default when the stored value cannot be right", () => {
    const [field] = mergeCandidates(
      [outcome({ "person.email": "nick@company.com" })],
      { "person.email": "not-an-address" },
      [EMAIL],
    );
    expect(field?.currentInvalid).toBe(true);
    expect(field?.defaultSelected).toBe(true);
  });

  it("leaves an overwrite unchecked when the stored value is fine", () => {
    const [field] = mergeCandidates(
      [outcome({ "person.title": "Head of Growth" })],
      { "person.title": "Growth Lead" },
      [TITLE],
    );
    expect(field?.currentInvalid).toBe(false);
    expect(field?.isOverwrite).toBe(true);
    expect(field?.defaultSelected).toBe(false);
  });

  // The stored primary is what the merge reads for a set target, so a broken primary has to reach
  // the dialog even though adding an address is never itself an overwrite.
  it("flags a broken primary on a set target without calling the add an overwrite", () => {
    const [field] = mergeCandidates(
      [outcome({ "person.email": "nick@company.com" })],
      { "person.email": "not-an-address" },
      [EMAIL],
      { "person.email": ["not-an-address"] },
    );
    expect(field?.currentInvalid).toBe(true);
    expect(field?.isOverwrite).toBe(false);
  });
});

// A field with a validity rule applies it to what the providers offer, not only to what the record
// holds. person.email can be mapped to a scalar custom field, and that route reaches the write
// through custom-field validation, which has no notion of an address: nothing downstream would
// catch a malformed value there.
describe("mergeCandidates, a provider value that breaks the field's rule", () => {
  it("does not offer a proposed value that is not an address", () => {
    const fields = mergeCandidates(
      [outcome({ "person.email": "also-broken@" })],
      { "person.email": "not-an-address" },
      [EMAIL],
    );
    expect(fields).toEqual([]);
  });

  it("keeps the addresses that do parse when a provider offers both", () => {
    const [field] = mergeCandidates(
      [
        outcome({ "person.email": "also-broken@" }),
        {
          provider: "rocketreach",
          kind: "ok",
          candidate: { fields: { "person.email": "nick@company.com" } },
        },
      ],
      { "person.email": null },
      [EMAIL],
    );
    expect(field?.values.map((v) => v.value)).toEqual(["nick@company.com"]);
  });

  it("leaves a field with no validity rule alone", () => {
    const [field] = mergeCandidates(
      [outcome({ "person.title": "!!!" })],
      { "person.title": null },
      [TITLE],
    );
    expect(field?.values.map((v) => v.value)).toEqual(["!!!"]);
  });
});

describe("mergeCandidates, promotable targets", () => {
  it("marks a set target as one whose new value can be promoted", () => {
    const [field] = mergeCandidates(
      [outcome({ "person.email": "nick@company.com" })],
      { "person.email": "old@company.com" },
      [EMAIL],
      { "person.email": ["old@company.com"] },
    );
    expect(field?.supportsPrimary).toBe(true);
  });

  it("does not offer promotion on a target that holds one value", () => {
    const [field] = mergeCandidates(
      [outcome({ "person.title": "Head of Growth" })],
      { "person.title": null },
      [TITLE],
    );
    expect(field?.supportsPrimary).toBe(false);
  });

  // Nothing is promoted behind the user's back: the choice defaults to adding alongside, and only
  // a primary that is already broken makes promotion the opening position.
  it("defaults to adding alongside, and to promoting when the primary is broken", () => {
    const [alongside] = mergeCandidates(
      [outcome({ "person.email": "nick@company.com" })],
      { "person.email": "old@company.com" },
      [EMAIL],
      { "person.email": ["old@company.com"] },
    );
    expect(alongside?.defaultMakePrimary).toBe(false);

    const [promote] = mergeCandidates(
      [outcome({ "person.email": "nick@company.com" })],
      { "person.email": "not-an-address" },
      [EMAIL],
      { "person.email": ["not-an-address"] },
    );
    expect(promote?.defaultMakePrimary).toBe(true);
  });
});
