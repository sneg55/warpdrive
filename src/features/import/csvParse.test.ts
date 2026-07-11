import { expect, it } from "vitest";
import { parseCsv } from "./csvParse";

it("parses a simple comma-separated file into header-keyed rows", () => {
  const { headers, rows } = parseCsv("name,email\nJane,jane@a.com\nBob,bob@b.com\n");
  expect(headers).toEqual(["name", "email"]);
  expect(rows).toEqual([
    { name: "Jane", email: "jane@a.com" },
    { name: "Bob", email: "bob@b.com" },
  ]);
});

it("honors quoted fields containing commas and escaped double-quotes", () => {
  const { rows } = parseCsv('name,note\n"Doe, Jane","she said ""hi"""\n');
  expect(rows[0]).toEqual({ name: "Doe, Jane", note: 'she said "hi"' });
});

it("supports embedded newlines inside quoted fields", () => {
  const { rows } = parseCsv('name,note\n"Jane","line1\nline2"\n');
  expect(rows[0]?.note).toBe("line1\nline2");
});

it("handles CRLF line endings and a missing final newline", () => {
  const { headers, rows } = parseCsv("name,email\r\nJane,jane@a.com");
  expect(headers).toEqual(["name", "email"]);
  expect(rows).toEqual([{ name: "Jane", email: "jane@a.com" }]);
});

it("pads short rows with empty strings and skips blank lines", () => {
  const { rows } = parseCsv("name,email,phone\nJane,jane@a.com\n\nBob,,555\n");
  expect(rows).toEqual([
    { name: "Jane", email: "jane@a.com", phone: "" },
    { name: "Bob", email: "", phone: "555" },
  ]);
});

it("returns empty headers and rows for empty input", () => {
  expect(parseCsv("")).toEqual({ headers: [], rows: [] });
});

it("skips physical lines that are only whitespace (common in spreadsheet exports)", () => {
  // A trailing "   " line is a single whitespace field, not real data: it must not
  // become a phantom all-empty row that then fails required-field validation.
  const { rows } = parseCsv("name\nJane\n   \nBob\n");
  expect(rows).toEqual([{ name: "Jane" }, { name: "Bob" }]);
});
