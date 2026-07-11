"use client";
import type React from "react";
import { CollapsibleSection } from "@/features/deal-workspace/CollapsibleSection";
import { FieldRow } from "@/features/deal-workspace/sidebar/FieldRow";
import { trpc } from "@/lib/trpc-client";

function capitalize(key: string): string {
  return key.length === 0 ? key : key[0]?.toUpperCase() + key.slice(1);
}

// Person/org detail "Overview" section (CO-2), modeled on the deal sidebar's Overview + the org
// Stats block: a compact activity summary (total + per-type counts + last-activity / inactive-days)
// sourced from contacts.activityStats. Read-only; the per-type rows collapse the counts-by-type the
// procedure computes into one row each.
export function ContactOverviewSection({
  entityType,
  entityId,
}: {
  entityType: "person" | "organization";
  entityId: string;
}): React.ReactNode {
  const stats = trpc.contacts.activityStats.useQuery({ entityType, entityId }).data;
  const total = stats?.total ?? 0;
  const byType = stats?.byType ?? {};
  const mostActiveUsers = stats?.mostActiveUsers ?? [];
  const lastActivityAt = stats?.lastActivityAt ?? null;
  const inactiveDays = stats?.inactiveDays ?? null;

  return (
    <CollapsibleSection title="Overview">
      <FieldRow label="Total activities">
        <span className="tabular-nums">{total}</span>
      </FieldRow>
      {Object.entries(byType).map(([key, count]) => (
        <FieldRow key={key} label={capitalize(key)}>
          <span className="tabular-nums">{count}</span>
        </FieldRow>
      ))}
      <FieldRow label="Most active users" empty={mostActiveUsers.length === 0}>
        {mostActiveUsers.length > 0
          ? mostActiveUsers.map((u) => `${u.name} (${u.count})`).join(", ")
          : "-"}
      </FieldRow>
      <FieldRow label="Last activity" empty={lastActivityAt === null}>
        {lastActivityAt !== null ? (
          <span className="tabular-nums">{lastActivityAt.toLocaleDateString()}</span>
        ) : (
          "-"
        )}
      </FieldRow>
      <FieldRow label="Inactive" empty={inactiveDays === null}>
        {inactiveDays !== null ? (
          <span>
            <span className="tabular-nums">{inactiveDays}</span> days
          </span>
        ) : (
          "-"
        )}
      </FieldRow>
    </CollapsibleSection>
  );
}
