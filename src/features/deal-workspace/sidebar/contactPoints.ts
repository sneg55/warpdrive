import type { ContactPoint } from "@/types/contactPoint";

export const DEFAULT_POINT_LABEL = "work";

export type StoredContactPoint = { label: string; value: string; primary?: boolean };

function fold(value: string): string {
  return value.trim().toLowerCase();
}

function normalize(point: StoredContactPoint): ContactPoint {
  return { label: point.label, value: point.value, primary: point.primary === true };
}

export function orderedPoints(
  points: readonly StoredContactPoint[],
  standalonePrimary?: string | null,
): ContactPoint[] {
  const filled = points.map(normalize).filter((p) => p.value.trim() !== "");
  const column =
    standalonePrimary === null || standalonePrimary === undefined ? "" : standalonePrimary.trim();
  const merged =
    column !== "" && !filled.some((p) => fold(p.value) === fold(column))
      ? [{ label: DEFAULT_POINT_LABEL, value: column, primary: true }, ...filled]
      : filled;
  const flaggedIndex = merged.findIndex((p) => p.primary);
  const namedIndex = column === "" ? -1 : merged.findIndex((p) => fold(p.value) === fold(column));
  const leadIndex = flaggedIndex !== -1 ? flaggedIndex : namedIndex !== -1 ? namedIndex : 0;
  return merged
    .map((p, i) => ({ ...p, primary: i === leadIndex }))
    .sort((a, b) => {
      if (a.primary === b.primary) return 0;
      return a.primary ? -1 : 1;
    });
}

export function serializePoints(points: readonly StoredContactPoint[]): string {
  return JSON.stringify(points.map(normalize));
}

export function parsePoints(draft: string): ContactPoint[] {
  let raw: unknown;
  try {
    raw = JSON.parse(draft);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw.filter(isPoint).map(normalize);
}

function isPoint(value: unknown): value is ContactPoint {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.label === "string" && typeof candidate.value === "string";
}

export function setValueAt(
  points: readonly ContactPoint[],
  index: number,
  value: string,
): ContactPoint[] {
  return points.map((p, i) => (i === index ? { ...p, value } : { ...p }));
}

export function removePointAt(points: readonly ContactPoint[], index: number): ContactPoint[] {
  return points.filter((_, i) => i !== index).map((p) => ({ ...p }));
}

export function setPrimaryAt(points: readonly ContactPoint[], index: number): ContactPoint[] {
  return points.map((p, i) => ({ ...p, primary: i === index }));
}

export function appendPoint(points: readonly ContactPoint[]): ContactPoint[] {
  return [
    ...points.map((p) => ({ ...p })),
    { label: DEFAULT_POINT_LABEL, value: "", primary: points.length === 0 },
  ];
}

export function committedPoints(points: readonly StoredContactPoint[]): ContactPoint[] {
  const filled = points
    .map((p) => ({ ...normalize(p), value: p.value.trim() }))
    .filter((p) => p.value !== "");
  const primaryIndex = filled.findIndex((p) => p.primary);
  const leadIndex = primaryIndex === -1 ? 0 : primaryIndex;
  return filled.map((p, i) => ({ ...p, primary: i === leadIndex }));
}
