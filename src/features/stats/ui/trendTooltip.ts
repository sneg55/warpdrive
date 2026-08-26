import { money } from "./Panel";

// The row recharts hands back for the hovered point. It arrives as unknown, so the count is read
// defensively: a month whose count is missing still has money worth showing.
function countOf(datum: unknown): number | null {
  if (typeof datum !== "object" || datum === null) return null;
  const count = (datum as { count?: unknown }).count;
  return typeof count === "number" ? count : null;
}

// The line plots money, which alone cannot say whether a good month was one large deal or ten
// small ones. The count is on the same row, so the tooltip states both.
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
