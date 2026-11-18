export function orNull(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export type MoneyParse = { ok: true; value: number | null } | { ok: false; error: string };

export function parseMoneyValue(raw: string): MoneyParse {
  const t = raw.trim();
  if (t === "") return { ok: true, value: null };
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, error: "Value must be a non-negative number" };
  }
  return { ok: true, value: Math.round(n * 100) / 100 };
}
