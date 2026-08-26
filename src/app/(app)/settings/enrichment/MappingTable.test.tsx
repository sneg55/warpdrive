// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ENRICHMENT_STRINGS } from "@/constants/enrichmentStrings";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import { type MappingRow, MappingTable } from "./MappingTable";
import { encodeTarget, NOT_MAPPED_VALUE } from "./targetOptions";

const S = ENRICHMENT_STRINGS.settings;
const DOMAIN = encodeTarget({ kind: "builtin", key: "domain" });
const CUSTOM = encodeTarget({ kind: "custom", fieldDefId: "f1" });

const ROWS: MappingRow[] = [
  {
    canonicalKey: "org.domain",
    label: "Website / domain",
    value: DOMAIN,
    options: [
      { value: NOT_MAPPED_VALUE, label: S.mappingNotMapped },
      { value: DOMAIN, label: "Website / domain", group: S.mappingBuiltinGroup },
      { value: CUSTOM, label: "Segment", group: S.mappingCustomGroup },
    ],
  },
];

afterEach(cleanup);

function renderTable(overrides: Partial<Parameters<typeof MappingTable>[0]> = {}) {
  const onSelect = vi.fn();
  render(
    <MappingTable
      title={S.mappingOrganization}
      rows={ROWS}
      hasCustomFields={true}
      busyKeys={new Set()}
      onSelect={onSelect}
      {...overrides}
    />,
  );
  return onSelect;
}

describe("MappingTable", () => {
  it("names each canonical row and scopes its picker to the table", () => {
    renderTable();
    expect(screen.getByText(S.mappingColField)).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: `${S.mappingOrganization} Website / domain` }),
    ).toBeInTheDocument();
  });

  it("clears a mapping when Not mapped is picked", () => {
    const onSelect = renderTable();
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByText(S.mappingNotMapped));
    expect(onSelect).toHaveBeenCalledWith("org.domain", NOT_MAPPED_VALUE);
  });

  it("sets a custom-field mapping when one is picked", () => {
    const onSelect = renderTable();
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByText("Segment"));
    expect(onSelect).toHaveBeenCalledWith("org.domain", CUSTOM);
  });

  it("locks only the pickers of the rows named as busy", () => {
    const industry: MappingRow = {
      canonicalKey: "org.industry",
      label: "Industry",
      value: NOT_MAPPED_VALUE,
      options: [{ value: NOT_MAPPED_VALUE, label: S.mappingNotMapped }],
    };
    renderTable({ rows: [...ROWS, industry], busyKeys: new Set(["org.domain"]) });

    const name = (label: string) => `${S.mappingOrganization} ${label}`;
    expect(screen.getByRole("combobox", { name: name("Website / domain") })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: name("Industry") })).toBeEnabled();
  });

  it("points at Data fields when the entity has no custom fields yet", () => {
    renderTable({ hasCustomFields: false });
    expect(screen.getByText(S.mappingNoCustomFields)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: S.mappingManageFields })).toHaveAttribute(
      "href",
      "/settings/fields",
    );
  });

  it("hides the hint once custom fields exist", () => {
    renderTable();
    expect(screen.queryByText(S.mappingNoCustomFields)).toBeNull();
  });
});
