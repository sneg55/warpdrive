import { describe, expect, it } from "vitest";
import { insertFields } from "@/features/email/composer/insertFields";
import {
  activityAnchor,
  dealComposerContext,
  emailTabEnabled,
  fileEntityType,
  fileTabEnabled,
  noteEntityType,
} from "./composeScope";

// These mappings are what let SharedComposeBar mount on any ComposeScope
// (deal/lead/person/org) and still route Activity/Notes/Email/Files to the
// right entity: each scope maps to its own note/file entity type, its own
// activity anchor (dealId vs leadId), and its own set of enabled tabs.
describe("composeScope mappings", () => {
  it("maps org scope to the organization note/file entity", () => {
    const scope = { entityType: "org" as const, entityId: "o1" };
    expect(noteEntityType(scope)).toBe("organization");
    expect(fileEntityType(scope)).toBe("organization");
  });

  it("passes deal and person scopes through unchanged for notes/files", () => {
    expect(noteEntityType({ entityType: "deal", entityId: "d1" })).toBe("deal");
    expect(fileEntityType({ entityType: "deal", entityId: "d1" })).toBe("deal");
    expect(noteEntityType({ entityType: "person", entityId: "p1" })).toBe("person");
    expect(fileEntityType({ entityType: "person", entityId: "p1" })).toBe("person");
  });

  it("lead scope has no file entity and no email/file tab", () => {
    const scope = { entityType: "lead" as const, entityId: "l1" };
    expect(noteEntityType(scope)).toBe("lead");
    expect(fileEntityType(scope)).toBeNull();
    expect(fileTabEnabled(scope)).toBe(false);
    expect(emailTabEnabled(scope)).toBe(false);
  });

  it("email tab only enabled for deal scope", () => {
    expect(emailTabEnabled({ entityType: "deal", entityId: "d1" })).toBe(true);
    expect(emailTabEnabled({ entityType: "person", entityId: "p1" })).toBe(false);
    expect(emailTabEnabled({ entityType: "org", entityId: "o1" })).toBe(false);
  });

  it("file tab enabled for every scope except lead", () => {
    expect(fileTabEnabled({ entityType: "deal", entityId: "d1" })).toBe(true);
    expect(fileTabEnabled({ entityType: "person", entityId: "p1" })).toBe(true);
    expect(fileTabEnabled({ entityType: "org", entityId: "o1" })).toBe(true);
  });

  it("activityAnchor routes lead vs deal correctly", () => {
    expect(activityAnchor({ entityType: "lead", entityId: "l1" })).toEqual({
      dealId: null,
      leadId: "l1",
      personId: null,
      orgId: null,
    });
    expect(
      activityAnchor({ entityType: "deal", entityId: "d1", personId: "p1", orgId: "o1" }),
    ).toEqual({ dealId: "d1", leadId: null, personId: "p1", orgId: "o1" });
  });

  // BUG EMAIL-21: the deal composer built its context from scope WITHOUT the
  // display values insertFields() needs, so insertFields returned [] and the
  // "Insert field" menu was unreachable. dealComposerContext threads them through.
  it("dealComposerContext threads display values so insertFields() is non-empty", () => {
    const ctx = dealComposerContext({
      entityType: "deal",
      entityId: "d1",
      personId: "p1",
      orgId: "o1",
      personName: "Ada Lovelace",
      personEmail: "ada@example.com",
      orgName: "Analytical Engines",
      dealTitle: "Big Deal",
      dealValue: "1000.00",
    });
    const labels = insertFields(ctx).map((f) => f.label);
    expect(labels.length).toBeGreaterThan(0);
    expect(labels).toEqual(
      expect.arrayContaining([
        "Deal title",
        "Deal value",
        "First name",
        "Last name",
        "Contact email",
        "Organization name",
      ]),
    );
  });

  it("dealComposerContext splits personName into first and last name", () => {
    const ctx = dealComposerContext({
      entityType: "deal",
      entityId: "d1",
      personName: "Ada Lovelace",
    });
    if (ctx.kind !== "deal") throw new Error("expected deal context");
    expect(ctx.personFirstName).toBe("Ada");
    expect(ctx.personLastName).toBe("Lovelace");
  });

  it("activityAnchor uses the scope's own entityId as personId/orgId for person/org scopes", () => {
    expect(activityAnchor({ entityType: "person", entityId: "p1" })).toEqual({
      dealId: null,
      leadId: null,
      personId: "p1",
      orgId: null,
    });
    expect(activityAnchor({ entityType: "org", entityId: "o1" })).toEqual({
      dealId: null,
      leadId: null,
      personId: null,
      orgId: "o1",
    });
  });
});
