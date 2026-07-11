// Shared Add-deal / Add-lead form-field parsing. Both entities persist the same money and label
// shapes, so keeping this in one place stops the two forms from drifting (e.g. one rounding money
// differently from the other and silently failing the server's multipleOf(0.01) check).

// Trim to null: blank optional strings collapse to null so an empty input never persists "".
export function orNull(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export type MoneyParse = { ok: true; value: number | null } | { ok: false; error: string };

// Blank -> no value; otherwise a non-negative number rounded to cents (the value columns are
// multipleOf(0.01)). Callers surface `error` as the form validation message.
export function parseMoneyValue(raw: string): MoneyParse {
  const t = raw.trim();
  if (t === "") return { ok: true, value: null };
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, error: "Value must be a non-negative number" };
  }
  return { ok: true, value: Math.round(n * 100) / 100 };
}

// Coerce a single label value: keep any non-blank catalog name, null out blanks. Labels are
// user-managed now, so there is no fixed key set to validate against here.
export function resolveLabelKey(raw: string | null | undefined): string | null {
  return orNull(raw);
}
