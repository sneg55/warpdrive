import { expect, it } from "vitest";
import { buildErrorCsv } from "./errorReport";

it("builds a CSV of invalid rows with flattened error reasons", () => {
  const csv = buildErrorCsv([
    {
      rowNumber: 2,
      raw: { Name: "", Email: "a@x.co" },
      errors: [{ field: "name", message: "required" }],
    },
    {
      rowNumber: 5,
      raw: { Name: "=CMD", Email: "" },
      errors: [{ field: "emails", message: "invalid" }],
    },
  ]);
  const lines = csv.split("\n");
  expect(lines[0]).toBe("row,errors,Name,Email");
  expect(lines[1]).toBe("2,name: required,,a@x.co");
  // Formula-injection cell is neutralized with a leading apostrophe.
  expect(lines[2]).toContain("'=CMD");
});
