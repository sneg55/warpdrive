import type React from "react";
import { STRINGS } from "@/constants/strings";

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
      {children}
    </section>
  );
}

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

export function durationDays(v: number): string {
  const rounded = Math.round(v);
  return rounded === 0 ? STRINGS.dashboard.underADay : `${rounded} ${STRINGS.dashboard.days}`;
}

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
