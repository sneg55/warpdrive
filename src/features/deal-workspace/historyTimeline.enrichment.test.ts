// Enrichment writes one change_logs row per applied field: a dotted canonical key for
// `field` and `{ value, providers }` for `newValue`. Both have to read as prose in the
// timeline, not as raw JSON.
import { describe, expect, it } from "vitest";
import { CHANGE_FIELD_TITLE } from "@/constants/changeLogFields";
import { buildHistoryTimeline, formatChangeLabel } from "./historyTimeline";

describe("formatChangeLabel: enrichment audit rows", () => {
  it("renders a canonical key as a human label with the plain value and the provider", () => {
    const label = formatChangeLabel({
      field: "org.industry",
      oldValue: "Software",
      newValue: { value: "Fintech", providers: ["apollo"] },
    });
    expect(label).toBe("Industry: Software → Fintech (from Apollo)");
    expect(label).not.toContain("{");
    expect(label).not.toContain("}");
    expect(label).not.toContain('"');
  });

  it("humanizes a camelCase canonical key from the shared vocabulary", () => {
    const label = formatChangeLabel({
      field: "person.companyName",
      oldValue: null,
      newValue: { value: "Acme", providers: ["rocketreach"] },
    });
    expect(label).toBe("Company name: (none) → Acme (from RocketReach)");
  });

  it("names both providers when two of them agreed on the value", () => {
    const label = formatChangeLabel({
      field: "org.industry",
      oldValue: null,
      newValue: { value: "Fintech", providers: ["apollo", "rocketreach"] },
    });
    expect(label).toContain("Apollo");
    expect(label).toContain("RocketReach");
    expect(label).not.toContain("{");
    expect(label).not.toContain('"');
  });

  it("falls back to the raw provider id when it is not a known provider", () => {
    const label = formatChangeLabel({
      field: "org.industry",
      oldValue: null,
      newValue: { value: "Fintech", providers: ["retired-provider"] },
    });
    expect(label).toBe("Industry: (none) → Fintech (from retired-provider)");
  });

  it("drops the provenance clause when no provider is recorded", () => {
    const label = formatChangeLabel({
      field: "org.industry",
      oldValue: "Software",
      newValue: { value: "Fintech", providers: [] },
    });
    expect(label).toBe("Industry: Software → Fintech");
  });

  it("renders an enrichment row as a plain event row on the timeline", () => {
    const items = buildHistoryTimeline(
      [],
      [
        {
          id: "chg",
          field: "org.employeeCount",
          oldValue: null,
          newValue: { value: 240, providers: ["getprospect"] },
          actorId: "u1",
          actorName: "Nick",
          createdAt: new Date("2026-08-24T00:00:00Z"),
        },
      ],
    );
    const evt = items[0];
    expect(evt?.kind).toBe("event");
    if (evt?.kind === "event") {
      expect(evt.label).toBe("Employee count: (none) → 240 (from GetProspect)");
      expect(evt.actorName).toBe("Nick");
    }
  });
});

describe("formatChangeLabel: rows that are not enrichment are untouched", () => {
  it("renders an ordinary field edit exactly as before", () => {
    expect(
      formatChangeLabel({ field: CHANGE_FIELD_TITLE, oldValue: "Old Deal", newValue: "New Deal" }),
    ).toBe("Title: Old Deal → New Deal");
    expect(
      formatChangeLabel({ field: "expected_close_date", oldValue: null, newValue: "2026-08-01" }),
    ).toBe("Expected close date: (none) → 2026-08-01");
    expect(formatChangeLabel({ field: "person_id", oldValue: null, newValue: "p1" })).toBe(
      "Linked a person",
    );
  });

  it("keeps rendering an unrelated object value the way it renders today", () => {
    expect(formatChangeLabel({ field: "labels", oldValue: null, newValue: ["Hot", "Cold"] })).toBe(
      "Labels: (none) → Hot, Cold",
    );
    expect(formatChangeLabel({ field: "title", oldValue: null, newValue: { a: 1 } })).toBe(
      'Title: (none) → {"a":1}',
    );
  });

  it("does not crash or print undefined on a legacy or malformed payload", () => {
    const malformed: unknown[] = [
      { value: "Fintech" },
      { providers: ["apollo"] },
      { value: "Fintech", providers: "apollo" },
      { value: null, providers: ["apollo"] },
      {},
      null,
    ];
    for (const newValue of malformed) {
      const label = formatChangeLabel({ field: "org.industry", oldValue: "Software", newValue });
      expect(label).not.toContain("undefined");
      expect(label.startsWith("Industry: Software → ")).toBe(true);
    }
  });
});
