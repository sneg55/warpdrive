import { describe, expect, it } from "vitest";
import type { CustomFieldDef } from "@/types/customFields";
import { applyMapping, validateMappedRow } from "./mapRow";
import { normalizeMapping } from "./schemas";

const personMapping = normalizeMapping(
  {
    dedupMode: "skip" as const,
    columns: {
      "Full Name": { entity: "person", field: "name", isCustom: false, key: "" },
      Email: { entity: "person", field: "emails", isCustom: false, key: "" },
      Seniority: { entity: "person", field: "", isCustom: true, key: "seniority" },
      Ignored: { entity: "person", field: "", isCustom: false, key: "" },
    },
  },
  "person",
);

describe("import mapping", () => {
  it("maps built-in and custom columns, ignores unmapped", () => {
    const mapped = applyMapping(
      { "Full Name": "Jane", Email: "jane@a.com", Seniority: "Director", Ignored: "x", Extra: "y" },
      personMapping,
      "person",
    );
    expect(mapped.primary).toEqual({
      name: "Jane",
      emails: [{ label: "work", value: "jane@a.com", primary: true }],
      customFields: { seniority: "Director" },
    });
    expect(mapped.organization).toBeUndefined();
    expect(mapped.note).toBeUndefined();
  });

  // A BD shortlist row is a lead AND its organization. url has to reach organizations.domain.
  it("groups cells by the entity that owns them", () => {
    const m = normalizeMapping(
      {
        dedupMode: "skip",
        columns: {
          agency_name: { entity: "organization", field: "name", isCustom: false, key: "" },
          url: { entity: "organization", field: "domain", isCustom: false, key: "" },
          title: { entity: "lead", field: "title", isCustom: false, key: "" },
        },
      },
      "lead",
    );
    const mapped = applyMapping(
      { agency_name: "NJ Transit", url: "njtransit.com", title: "NJ Transit lead" },
      m,
      "lead",
    );
    expect(mapped.primary).toEqual({ title: "NJ Transit lead", customFields: {} });
    expect(mapped.organization).toEqual({ name: "NJ Transit", domain: "njtransit.com" });
  });

  it("reassembles dotted address leaves into the nested address object", () => {
    const m = normalizeMapping(
      {
        dedupMode: "skip",
        columns: {
          agency_name: { entity: "organization", field: "name", isCustom: false, key: "" },
          city: { entity: "organization", field: "address.city", isCustom: false, key: "" },
          state: { entity: "organization", field: "address.region", isCustom: false, key: "" },
        },
      },
      "lead",
    );
    const mapped = applyMapping({ agency_name: "NJT", city: "Newark", state: "NJ" }, m, "lead");
    expect(mapped.organization).toEqual({
      name: "NJT",
      address: { city: "Newark", region: "NJ" },
    });
  });

  it("omits an entity group entirely when none of its cells are present", () => {
    const m = normalizeMapping(
      {
        dedupMode: "skip",
        columns: {
          title: { entity: "lead", field: "title", isCustom: false, key: "" },
          agency_name: { entity: "organization", field: "name", isCustom: false, key: "" },
        },
      },
      "lead",
    );
    const mapped = applyMapping({ title: "Solo lead", agency_name: "" }, m, "lead");
    expect(mapped.organization).toBeUndefined();
  });

  it("builds the note from the mapped body plus the unmapped columns", () => {
    const m = normalizeMapping(
      {
        dedupMode: "skip",
        options: { rowNoteFromUnmapped: true },
        columns: {
          title: { entity: "lead", field: "title", isCustom: false, key: "" },
          summary: { entity: "note", field: "body", isCustom: false, key: "" },
        },
      },
      "lead",
    );
    const mapped = applyMapping(
      { title: "T", summary: "Full Reporter", posture: "fails" },
      m,
      "lead",
    );
    expect(mapped.note).toEqual({ body: "Full Reporter\n\nposture: fails" });
  });

  it("reports validation errors against the person create schema", () => {
    const defs: CustomFieldDef[] = [];
    const result = validateMappedRow(
      "person",
      { primary: { name: "", emails: [], customFields: {} } },
      defs,
    );
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.errors.some((e) => e.field === "name")).toBe(true);
  });

  it("accepts a deal row with a raw pipeline/stage name and coerces value to a number", () => {
    const defs: CustomFieldDef[] = [];
    const result = validateMappedRow(
      "deal",
      { primary: { title: "Acme deal", value: "1200.50", pipeline: "Sales", customFields: {} } },
      defs,
    );
    expect(result.ok).toBe(true);
    if (result.ok === true) {
      expect(result.value.primary.value).toBe(1200.5);
      expect(result.value.primary.pipeline).toBe("Sales");
    }
  });

  it("reports a deal row missing the required title", () => {
    const defs: CustomFieldDef[] = [];
    const result = validateMappedRow("deal", { primary: { customFields: {} } }, defs);
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.errors.some((e) => e.field === "title")).toBe(true);
  });

  it("accepts a lead row (title + value only, no custom fields)", () => {
    const defs: CustomFieldDef[] = [];
    const result = validateMappedRow(
      "lead",
      { primary: { title: "A lead", value: "500", customFields: {} } },
      defs,
    );
    expect(result.ok).toBe(true);
    if (result.ok === true) expect(result.value.primary.value).toBe(500);
  });

  it("normalizes an activity due date to ISO and reports a bad date as invalid", () => {
    const defs: CustomFieldDef[] = [];
    const ok = validateMappedRow(
      "activity",
      { primary: { subject: "Follow up", dueAt: "2026-08-01", customFields: {} } },
      defs,
    );
    expect(ok.ok).toBe(true);
    if (ok.ok === true) expect(ok.value.primary.dueAt).toBe(new Date("2026-08-01").toISOString());

    const bad = validateMappedRow(
      "activity",
      { primary: { subject: "Follow up", dueAt: "not-a-date", customFields: {} } },
      defs,
    );
    expect(bad.ok).toBe(false);
    if (bad.ok === false) expect(bad.errors.some((e) => e.field === "dueAt")).toBe(true);
  });

  // An organization group with no name has no key to find-or-create on.
  it("rejects an organization group that carries fields but no name", () => {
    const defs: CustomFieldDef[] = [];
    const result = validateMappedRow(
      "lead",
      { primary: { title: "A lead" }, organization: { domain: "njtransit.com" } },
      defs,
    );
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.errors.some((e) => e.field === "organization.name")).toBe(true);
    }
  });

  it("coerces an organization employeeCount from its CSV string", () => {
    const defs: CustomFieldDef[] = [];
    const result = validateMappedRow(
      "lead",
      {
        primary: { title: "A lead", customFields: {} },
        organization: { name: "NJT", employeeCount: "3431" },
      },
      defs,
    );
    expect(result.ok).toBe(true);
    if (result.ok === true) expect(result.value.organization?.employeeCount).toBe(3431);
  });

  it("validates a lead custom column against lead defs", () => {
    const m = normalizeMapping(
      {
        dedupMode: "skip",
        columns: {
          title: { entity: "lead", field: "title", isCustom: false, key: "" },
          grade: { entity: "lead", field: "", isCustom: true, key: "grade" },
        },
      },
      "lead",
    );
    const mapped = applyMapping({ title: "Graded", grade: "A" }, m, "lead");
    expect(mapped.primary).toEqual({ title: "Graded", customFields: { grade: "A" } });

    const gradeDef: CustomFieldDef = {
      id: "cf",
      targetEntity: "lead",
      type: "numeric",
      name: "Grade",
      key: "grade",
      options: [],
      isRequired: false,
      isImportant: false,
      showInAddForm: false,
      order: 0,
      archivedAt: null,
    };
    const bad = validateMappedRow("lead", mapped, [gradeDef]);
    expect(bad.ok).toBe(false);
  });
});
