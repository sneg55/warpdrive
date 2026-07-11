import { expect, it } from "vitest";
import { isTerminalImportStatus } from "@/constants/importStatus";
import {
  ENTITY_FIELDS,
  ENTITY_LABELS,
  primaryEntityOf,
  STANDARD_IMPORT_FIELDS,
  TARGET_ENTITY_GROUPS,
} from "./importFields";

it("offers name (required) for both importable entities", () => {
  expect(ENTITY_FIELDS.person.find((f) => f.field === "name")?.required).toBe(true);
  expect(ENTITY_FIELDS.organization.find((f) => f.field === "name")?.required).toBe(true);
});

it("offers emails/phones only for person (CSV-coercible standard fields)", () => {
  const personFields = ENTITY_FIELDS.person.map((f) => f.field);
  expect(personFields).toContain("emails");
  expect(personFields).toContain("phones");
  expect(ENTITY_FIELDS.organization.map((f) => f.field)).not.toContain("emails");
});

it("classifies batch statuses as terminal or in-progress", () => {
  expect(isTerminalImportStatus("completed")).toBe(true);
  expect(isTerminalImportStatus("partial")).toBe(true);
  expect(isTerminalImportStatus("failed")).toBe(true);
  expect(isTerminalImportStatus("importing")).toBe(false);
  expect(isTerminalImportStatus("pending")).toBe(false);
});

it("exposes standard fields for deal/lead/activity entities", () => {
  expect(ENTITY_FIELDS.deal.some((f) => f.field === "title" && f.required)).toBe(true);
  expect(ENTITY_FIELDS.lead.some((f) => f.field === "title" && f.required)).toBe(true);
  expect(ENTITY_FIELDS.activity.some((f) => f.field === "subject" && f.required)).toBe(true);
});

it("offers pipeline/stage for deal only", () => {
  const dealFields = ENTITY_FIELDS.deal.map((f) => f.field);
  expect(dealFields).toEqual(
    expect.arrayContaining(["title", "value", "expectedCloseDate", "pipeline", "stage"]),
  );
  const activityFields = ENTITY_FIELDS.activity.map((f) => f.field);
  expect(activityFields).toEqual(
    expect.arrayContaining(["subject", "typeKey", "dueAt", "durationMinutes"]),
  );
});

// The url column in a BD shortlist has to land somewhere. organizations.domain is the
// website/domain column; before this it was not offered at all.
it("offers the organization firmographics that the table actually has", () => {
  const orgFields = ENTITY_FIELDS.organization.map((f) => f.field);
  expect(orgFields).toEqual(
    expect.arrayContaining([
      "name",
      "domain",
      "industry",
      "employeeCount",
      "annualRevenue",
      "linkedinUrl",
    ]),
  );
});

// address is a nested object on orgCreateInput, so it is offered as dotted leaf fields that
// mapRow reassembles. A raw CSV cell fed to the object schema would fail.
it("offers address subfields as dotted leaves, never a bare address field", () => {
  const orgFields = ENTITY_FIELDS.organization.map((f) => f.field);
  expect(orgFields).toContain("address.city");
  expect(orgFields).toContain("address.region");
  expect(orgFields).not.toContain("address");
});

it("offers a note body", () => {
  expect(ENTITY_FIELDS.note.map((f) => f.field)).toEqual(["body"]);
  expect(ENTITY_FIELDS.note[0]?.required).toBe(false);
});

// A lead links to an org through the Organization group's name field now, not a lead-level
// orgName pseudo-field.
it("no longer carries the orgName pseudo-field on lead", () => {
  expect(ENTITY_FIELDS.lead.map((f) => f.field)).not.toContain("orgName");
});

it("groups each target with the entities it may write", () => {
  expect(TARGET_ENTITY_GROUPS.lead).toEqual(["lead", "organization", "note"]);
  expect(TARGET_ENTITY_GROUPS.deal).toEqual(["deal", "organization", "person", "note"]);
  expect(TARGET_ENTITY_GROUPS.person).toEqual(["person", "organization", "note"]);
  expect(TARGET_ENTITY_GROUPS.organization).toEqual(["organization", "note"]);
});

// notes.entityType is deal/person/organization/lead. Offering Note on an activity import would
// build a mapping that only fails once the row reaches createNote.
it("offers no note group on an activity import, since notes cannot attach to activities", () => {
  expect(TARGET_ENTITY_GROUPS.activity).toEqual(["activity"]);
});

it("puts the primary entity first in every target's groups", () => {
  for (const target of ["person", "organization", "deal", "lead", "activity"] as const) {
    expect(TARGET_ENTITY_GROUPS[target][0]).toBe(primaryEntityOf(target));
  }
});

it("labels every mappable entity for the picker", () => {
  for (const entity of Object.keys(ENTITY_FIELDS)) {
    expect(ENTITY_LABELS[entity as keyof typeof ENTITY_LABELS]).toBeTruthy();
  }
});

// STANDARD_IMPORT_FIELDS stays as the primary entity's fields so mapping-completeness and the
// row schemas keep one source of truth.
it("derives STANDARD_IMPORT_FIELDS from the primary entity's catalog", () => {
  expect(STANDARD_IMPORT_FIELDS.lead).toEqual(ENTITY_FIELDS.lead);
  expect(STANDARD_IMPORT_FIELDS.organization).toEqual(ENTITY_FIELDS.organization);
});
