import { expect, it } from "vitest";
import { buildErrorCsv } from "./errorReport";

it("builds a CSV of invalid rows with flattened error reasons", () => {
  const csv = buildErrorCsv([
    {
      rowNumber: 2,
      raw: { Name: "", Email: "a@x.co" },
      errors: [{ field: "name", message: "required" }],
      warnings: [],
    },
    {
      rowNumber: 5,
      raw: { Name: "=CMD", Email: "" },
      errors: [{ field: "emails", message: "invalid" }],
      warnings: [],
    },
  ]);
  const lines = csv.split("\n");
  expect(lines[0]).toBe("row,errors,warnings,Name,Email");
  expect(lines[1]).toBe("2,name: required,,,a@x.co");
  expect(lines[2]).toContain("'=CMD");
});

it("flattens warnings into their own column", () => {
  const csv = buildErrorCsv([
    {
      rowNumber: 3,
      raw: { Name: "Acme" },
      errors: [],
      warnings: [
        { field: "owner", message: "owner not found" },
        { field: "stage", message: "stage created" },
      ],
    },
  ]);
  const lines = csv.split("\n");
  expect(lines[0]).toBe("row,errors,warnings,Name");
  expect(lines[1]).toBe("3,,owner: owner not found; stage: stage created,Acme");
});
