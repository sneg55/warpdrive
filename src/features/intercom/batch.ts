import { INTERCOM_INSERT_CHUNK_ROWS } from "@/constants/intercom";

export function uniqueBy<T>(rows: T[], key: (row: T) => string): T[] {
  return [...new Map(rows.map((r) => [key(r), r])).values()];
}

export function chunks<T>(rows: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += INTERCOM_INSERT_CHUNK_ROWS) {
    out.push(rows.slice(i, i + INTERCOM_INSERT_CHUNK_ROWS));
  }
  return out;
}
