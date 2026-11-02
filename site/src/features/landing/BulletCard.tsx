import type { ReactNode } from "react";

export function BulletCard({ heading, items }: { heading: string; items: readonly string[] }): ReactNode {
  return (
    <div className="rounded-lg border bg-card p-6">
      <h2 className="font-semibold">{heading}</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
