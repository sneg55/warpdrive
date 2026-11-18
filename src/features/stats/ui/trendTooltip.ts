import { money } from "./Panel";

function countOf(datum: unknown): number | null {
  if (typeof datum !== "object" || datum === null) return null;
  const count = (datum as { count?: unknown }).count;
  return typeof count === "number" ? count : null;
}

export function trendTooltipValue(
  value: string | number | undefined,
  datum: unknown,
  currency: string,
): string {
  const amount = money(String(value ?? 0), currency);
  const count = countOf(datum);
  if (count === null) return amount;
  return `${amount} from ${count} ${count === 1 ? "deal" : "deals"}`;
}
