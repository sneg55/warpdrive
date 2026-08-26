// A CSV that carries "First name" / "Last name" instead of one full-name column is the ordinary
// shape of an exported contact list, so the picker offers both and the display name is derived
// from them when the file has no name column of its own.
import { describe, expect, it } from "vitest";
import { ENTITY_FIELDS } from "./importFields";
import { applyMapping, validateMappedRow } from "./mapRow";
import { normalizeMapping } from "./schemas";
import {
  initialWizardState,
  isMappingComplete,
  type WizardState,
  wizardReducer,
} from "./wizardState";

const partsMapping = normalizeMapping(
  {
    dedupMode: "skip" as const,
    columns: {
      First: { entity: "person", field: "firstName", isCustom: false, key: "" },
      Last: { entity: "person", field: "lastName", isCustom: false, key: "" },
    },
  },
  "person",
);

describe("import: person name parts", () => {
  it("offers both parts on the person entity, neither required on its own", () => {
    const first = ENTITY_FIELDS.person.find((f) => f.field === "firstName");
    const last = ENTITY_FIELDS.person.find((f) => f.field === "lastName");

    expect(first?.label).toBe("First name");
    expect(last?.label).toBe("Last name");
    expect(first?.required).toBe(false);
    expect(last?.required).toBe(false);
  });

  it("derives the display name from the parts when the file has no name column", () => {
    const mapped = applyMapping({ First: "Ada", Last: "Lovelace" }, partsMapping, "person");

    expect(mapped.primary).toEqual({
      firstName: "Ada",
      lastName: "Lovelace",
      name: "Ada Lovelace",
      customFields: {},
    });
    expect(validateMappedRow("person", mapped, []).ok).toBe(true);
  });

  it("keeps a mapped name column rather than rebuilding it from the parts", () => {
    const withName = normalizeMapping(
      {
        dedupMode: "skip" as const,
        columns: {
          Full: { entity: "person", field: "name", isCustom: false, key: "" },
          First: { entity: "person", field: "firstName", isCustom: false, key: "" },
        },
      },
      "person",
    );
    const mapped = applyMapping({ Full: "A. Lovelace", First: "Ada" }, withName, "person");

    expect(mapped.primary.name).toBe("A. Lovelace");
  });

  it("carries the parts on a deal row's related person group", () => {
    const dealMapping = normalizeMapping(
      {
        dedupMode: "skip" as const,
        columns: {
          Title: { entity: "deal", field: "title", isCustom: false, key: "" },
          First: { entity: "person", field: "firstName", isCustom: false, key: "" },
          Last: { entity: "person", field: "lastName", isCustom: false, key: "" },
        },
      },
      "deal",
    );
    const mapped = applyMapping(
      { Title: "Valley Metro pilot", First: "Ada", Last: "Lovelace" },
      dealMapping,
      "deal",
    );

    const validated = validateMappedRow("deal", mapped, []);
    expect(validated.ok).toBe(true);
    expect(validated.ok && validated.value.person).toEqual({
      name: "Ada Lovelace",
      firstName: "Ada",
      lastName: "Lovelace",
      emails: [],
      phones: [],
    });
  });

  it("completes the mapping step on the parts alone, with no name column mapped", () => {
    const loaded = (): WizardState =>
      wizardReducer(initialWizardState(), {
        type: "loadFile",
        filename: "contacts.csv",
        headers: ["First", "Last"],
        rows: [{ First: "Ada", Last: "Lovelace" }],
      });
    let s = loaded();
    expect(isMappingComplete(s)).toBe(false);

    s = wizardReducer(s, {
      type: "setColumn",
      header: "First",
      choice: { entity: "person", field: "firstName", isCustom: false, key: "" },
    });

    expect(isMappingComplete(s)).toBe(true);
  });
});
