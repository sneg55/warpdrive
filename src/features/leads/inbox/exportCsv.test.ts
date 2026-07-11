import { describe, expect, it } from "vitest";
import type { LeadRow } from "../leadRepo";
import { LEAD_COLUMNS } from "./columns";
import { columnsFromKeys, leadRowsToCsv } from "./exportCsv";

const cols = LEAD_COLUMNS.filter((c) => ["title", "labels", "owner"].includes(c.key));

const row: LeadRow = {
  id: "l1",
  title: "Acme, Inc lead",
  value: "1200.00",
  labels: ["Hot", "Warm"],
  sourceOrigin: "manually_created",
  personName: null,
  orgName: null,
  ownerName: "Nick",
  nextActivityAt: null,
  createdAt: new Date("2026-06-01T00:00:00Z"),
  archivedAt: null,
  updatedAt: new Date("2026-06-01T00:00:00Z"),
  convertedDealId: null,
};

describe("leadRowsToCsv", () => {
  it("emits a header row from the visible columns", () => {
    const csv = leadRowsToCsv([], cols, "USD");
    expect(csv).toBe("Title,Labels,Owner");
  });

  it("quotes fields containing a comma and joins the stored label names", () => {
    const csv = leadRowsToCsv([row], cols, "USD");
    const [, dataLine] = csv.split("\n");
    expect(dataLine).toBe('"Acme, Inc lead","Hot, Warm",Nick');
  });

  it("neutralizes spreadsheet formula injection in a leading =/+/-/@ cell", () => {
    const evil: LeadRow = { ...row, title: '=HYPERLINK("http://evil","x")', ownerName: "@cmd" };
    const csv = leadRowsToCsv([evil], cols, "USD");
    const dataLine = csv.split("\n")[1] ?? "";
    // A leading apostrophe forces the spreadsheet to treat the cell as text, not a formula.
    // The title also contains a comma/quote so it is RFC-4180 quoted around the neutralized value.
    expect(dataLine.includes("'=HYPERLINK")).toBe(true);
    expect(dataLine.endsWith("'@cmd")).toBe(true);
  });
});

describe("columnsFromKeys", () => {
  it("maps keys to descriptors in the given order, dropping unknowns", () => {
    const cols = columnsFromKeys(["owner", "title", "bogus"]);
    expect(cols.map((c) => c.key)).toEqual(["owner", "title"]);
  });
});
