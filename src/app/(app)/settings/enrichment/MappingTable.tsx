"use client";
import Link from "next/link";
import type React from "react";
import { Select, type SelectOption } from "@/components/ui/Select";
import { ENRICHMENT_STRINGS } from "@/constants/enrichmentStrings";
import {
  SETTINGS_TABLE_CELL,
  SETTINGS_TABLE_HEAD,
  SETTINGS_TABLE_HEADER_CELL,
  SETTINGS_TABLE_ROW,
} from "../SettingsSurface";

const S = ENRICHMENT_STRINGS.settings;
const FIELDS_HREF = "/settings/fields";

export interface MappingRow {
  canonicalKey: string;
  label: string;
  value: string;
  options: SelectOption[];
}

export function MappingTable({
  title,
  rows,
  hasCustomFields,
  busyKeys,
  onSelect,
}: {
  title: string;
  rows: MappingRow[];
  hasCustomFields: boolean;
  // Canonical keys whose target is being written right now.
  busyKeys: ReadonlySet<string>;
  onSelect: (canonicalKey: string, value: string) => void;
}): React.ReactNode {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead className={SETTINGS_TABLE_HEAD}>
            <tr>
              <th className={SETTINGS_TABLE_HEADER_CELL}>{S.mappingColField}</th>
              <th className={SETTINGS_TABLE_HEADER_CELL}>{S.mappingColTarget}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.canonicalKey} className={SETTINGS_TABLE_ROW}>
                <td className={SETTINGS_TABLE_CELL}>{row.label}</td>
                <td className={SETTINGS_TABLE_CELL}>
                  <Select
                    disabled={busyKeys.has(row.canonicalKey)}
                    value={row.value}
                    onChange={(v) => onSelect(row.canonicalKey, v)}
                    options={row.options}
                    ariaLabel={`${title} ${row.label}`}
                    placeholder={S.mappingNotMapped}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!hasCustomFields && (
        <p className="text-sm text-muted-foreground">
          {S.mappingNoCustomFields}{" "}
          <Link href={FIELDS_HREF} className="text-action underline">
            {S.mappingManageFields}
          </Link>
        </p>
      )}
    </div>
  );
}
