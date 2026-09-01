"use client";

import type React from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { ENRICHMENT_STRINGS } from "@/constants/enrichmentStrings";
import { ProspectResultRow } from "./ProspectResultRow";
import type { BadgedProspect } from "./types";

const S = ENRICHMENT_STRINGS.prospects;

function headerState(
  profiles: readonly BadgedProspect[],
  isSelected: (ref: string) => boolean,
): boolean | "indeterminate" {
  const picked = profiles.filter((p) => isSelected(p.providerRef)).length;
  if (picked === 0) return false;
  return picked === profiles.length ? true : "indeterminate";
}

export function ProspectResultsTable({
  profiles,
  isSelected,
  selectionFull,
  hasMore,
  loadingMore,
  onToggle,
  onTogglePage,
  onLoadMore,
}: {
  profiles: readonly BadgedProspect[];
  isSelected: (providerRef: string) => boolean;
  selectionFull: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onToggle: (providerRef: string) => void;
  onTogglePage: (select: boolean) => void;
  onLoadMore: () => void;
}): React.ReactNode {
  const allOnPage = headerState(profiles, isSelected);
  return (
    <div className="flex flex-col gap-3">
      <div className="max-h-96 overflow-y-auto rounded-md border border-border">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 bg-background">
            <tr className="border-border border-b">
              <th className="w-8 py-2 pl-3">
                <Checkbox
                  checked={allOnPage}
                  onCheckedChange={onTogglePage}
                  label={S.selectAllOnPage}
                />
              </th>
              <th className="py-2 pl-2 font-normal text-muted-foreground text-xs">
                {S.columnPerson}
              </th>
              <th className="py-2 pl-3 font-normal text-muted-foreground text-xs">
                {S.columnTitle}
              </th>
              <th className="py-2 pl-3 font-normal text-muted-foreground text-xs">
                {S.columnLocation}
              </th>
              <th className="py-2 pr-3 pl-3 font-normal text-muted-foreground text-xs">
                {S.columnSignals}
              </th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((profile) => {
              const checked = isSelected(profile.providerRef);
              return (
                <ProspectResultRow
                  key={profile.providerRef}
                  profile={profile}
                  checked={checked}
                  disabled={selectionFull && !checked}
                  onCheckedChange={() => {
                    onToggle(profile.providerRef);
                  }}
                />
              );
            })}
          </tbody>
        </table>
      </div>
      {hasMore ? (
        <Button variant="outline" size="sm" disabled={loadingMore} onClick={onLoadMore}>
          {loadingMore ? S.loadingMore : S.loadMore}
        </Button>
      ) : null}
    </div>
  );
}
