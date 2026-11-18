import { expect, it } from "vitest";
import { isTerminalImportStatus } from "@/constants/importStatus";
import {
  ENTITY_FIELDS,
  ENTITY_LABELS,
  fieldsFor,
  primaryEntityOf,
  qualifiedFieldLabel,
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

it("offers address subfields as dotted leaves, never a bare address field", () => {
  const orgFields = ENTITY_FIELDS.organization.map((f) => f.field);
  expect(orgFields).toContain("address.city");
  expect(orgFields).toContain("address.region");
  expect(orgFields).not.toContain("address");
});

it("offers a note body", () => {
  expect(fieldsFor("note", "csv").map((f) => f.field)).toEqual(["body"]);
  expect(ENTITY_FIELDS.note[0]?.required).toBe(false);
});

it("no longer carries the orgName pseudo-field on lead", () => {
  expect(ENTITY_FIELDS.lead.map((f) => f.field)).not.toContain("orgName");
});

it("groups each target with the entities it may write", () => {
  expect(TARGET_ENTITY_GROUPS.lead).toEqual(["lead", "organization", "person", "note"]);
  expect(TARGET_ENTITY_GROUPS.deal).toEqual(["deal", "organization", "person", "note"]);
  expect(TARGET_ENTITY_GROUPS.person).toEqual(["person", "organization", "note"]);
  expect(TARGET_ENTITY_GROUPS.organization).toEqual(["organization", "note"]);
});

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

it("qualifies a field label with its owning entity", () => {
  expect(qualifiedFieldLabel("organization", "Name")).toBe("Organization[Name]");
  expect(qualifiedFieldLabel("person", "Name")).toBe("Person[Name]");
  expect(qualifiedFieldLabel("organization", "Address: city")).toBe("Organization[Address: city]");
});

it("does not repeat an entity whose field label already names it", () => {
  expect(qualifiedFieldLabel("note", "Note")).toBe("Note");
});

it("derives STANDARD_IMPORT_FIELDS from the primary entity's catalog", () => {
  expect(STANDARD_IMPORT_FIELDS.lead).toEqual(ENTITY_FIELDS.lead);
  expect(STANDARD_IMPORT_FIELDS.organization).toEqual(ENTITY_FIELDS.organization);
});
