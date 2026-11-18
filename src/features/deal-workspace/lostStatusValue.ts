export interface LostStatusValue {
  value: "lost";
  reason: string | null;
  comment: string | null;
}

function present(s: string | null | undefined): string | null {
  if (s === null || s === undefined) return null;
  const trimmed = s.trim();
  return trimmed === "" ? null : trimmed;
}

export function lostStatusValue(
  reason: string | null | undefined,
  comment: string | null | undefined,
): LostStatusValue | "lost" {
  const r = present(reason);
  const c = present(comment);
  if (r === null && c === null) return "lost";
  return { value: "lost", reason: r, comment: c };
}

export function asLostStatusValue(value: unknown): LostStatusValue | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.value !== "lost") return null;
  const reason = typeof record.reason === "string" ? record.reason : null;
  const comment = typeof record.comment === "string" ? record.comment : null;
  return { value: "lost", reason, comment };
}
