import { escapeCsv } from "@/features/import/csvSafe";
import { formatCurrency } from "@/lib/formatCurrency";
import type { LeadRow } from "../leadRepo";
import { LEAD_COLUMNS, type LeadColumn } from "./columns";

// Resolve an ordered visible-key list (from the client) to ordered column descriptors, dropping any
// key the server does not recognize. Keeps the export header/order matching the user's table.
export function columnsFromKeys(keys: readonly string[]): LeadColumn[] {
  return keys.flatMap((k) => {
    const c = LEAD_COLUMNS.find((x) => x.key === k);
    return c ? [c] : [];
  });
}

function isoDate(d: Date | string | null): string {
  if (d === null) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toISOString().slice(0, 10);
}

function cellValue(key: string, row: LeadRow, currency: string): string {
  switch (key) {
    case "title":
      return row.title;
    case "nextActivity":
      return isoDate(row.nextActivityAt);
    case "labels":
      return row.labels.join(", ");
    case "sourceOrigin":
      return row.sourceOrigin.replace(/_/g, " ");
    case "value":
      return row.value !== null ? formatCurrency(row.value, currency) : "";
    case "createdAt":
      return isoDate(row.createdAt);
    case "owner":
      return row.ownerName ?? "";
    default:
      return "";
  }
}

// Pure: build a CSV string for the visible columns of the given rows (current filtered/sorted set).
export function leadRowsToCsv(rows: LeadRow[], columns: LeadColumn[], currency: string): string {
  const header = columns.map((c) => escapeCsv(c.header)).join(",");
  const lines = rows.map((row) =>
    columns.map((c) => escapeCsv(cellValue(c.key, row, currency))).join(","),
  );
  return [header, ...lines].join("\n");
}
