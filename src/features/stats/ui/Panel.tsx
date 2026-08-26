import type React from "react";
import { STRINGS } from "@/constants/strings";

// Every dashboard panel goes through here so an empty one says why it is empty. A heading
// over dead space reads as a broken page, not as "there is nothing to show".
export function Panel({
  title,
  isEmpty,
  emptyText,
  children,
}: {
  title: string;
  isEmpty: boolean;
  emptyText: string;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <section className="rounded-lg border p-4">
      <h2 className="mb-2 text-balance text-sm font-medium text-muted-foreground">{title}</h2>
      {isEmpty && <p className="text-sm text-muted-foreground">{emptyText}</p>}
      {/* Rendered in both states: an empty panel may still carry an action, and swallowing
          children here made the "set up goals" link unreachable exactly when it was needed. */}
      {children}
    </section>
  );
}

// Accessible horizontal bar (Pipedrive visualizes these stats as bars/funnels).
// pct is 0..100; label names the measure for screen readers.
export function Bar({ label, pct }: { label: string; pct: number }): React.ReactNode {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-2 w-full overflow-hidden rounded bg-muted"
    >
      <div className="h-full rounded bg-primary" style={{ width: `${clamped}%` }} />
    </div>
  );
}

// A span shorter than half a day rounds to 0, and "0 days" claims the work took no time at all.
export function durationDays(v: number): string {
  const rounded = Math.round(v);
  return rounded === 0 ? STRINGS.dashboard.underADay : `${rounded} ${STRINGS.dashboard.days}`;
}

// "2026-01" to "Jan 2026". Parsed as UTC so the label cannot slip to the previous month for a
// reader west of Greenwich.
export function monthLabel(month: string): string {
  const at = Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(at);
}

export function money(v: string, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(v));
}
