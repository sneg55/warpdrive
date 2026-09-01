"use client";

import type React from "react";
import { useId } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { MultiCombobox } from "@/components/ui/MultiCombobox";
import { ENRICHMENT_STRINGS } from "@/constants/enrichmentStrings";
import { PROSPECT_SENIORITIES, type ProspectSeniority } from "@/constants/prospectSearch";
import type { ProviderId } from "../providers/types";
import { ProviderSelect } from "./ProviderSelect";

const S = ENRICHMENT_STRINGS.prospects;

const SENIORITY_LABELS: Readonly<Record<ProspectSeniority, string>> = {
  owner: "Owner",
  founder: "Founder",
  c_suite: "C-suite",
  partner: "Partner",
  vp: "VP",
  head: "Head",
  director: "Director",
  manager: "Manager",
  senior: "Senior",
  entry: "Entry",
  intern: "Intern",
};

const SENIORITY_OPTIONS = PROSPECT_SENIORITIES.map((value) => ({
  value,
  label: SENIORITY_LABELS[value],
}));

export interface ProspectFiltersValue {
  provider: ProviderId;
  title: string;
  seniorities: ProspectSeniority[];
}

function isSeniority(value: string): value is ProspectSeniority {
  return (PROSPECT_SENIORITIES as readonly string[]).includes(value);
}

export function ProspectFilters({
  value,
  providers,
  busy,
  onChange,
  onSearch,
}: {
  value: ProspectFiltersValue;
  providers: readonly ProviderId[];
  busy: boolean;
  onChange: (next: ProspectFiltersValue) => void;
  onSearch: () => void;
}): React.ReactNode {
  const titleId = useId();
  const seniorityId = useId();
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSearch();
      }}
    >
      <ProviderSelect
        value={value.provider}
        providers={providers}
        onChange={(provider) => {
          onChange({ ...value, provider });
        }}
      />
      <div className="flex min-w-56 flex-1 flex-col gap-1">
        <label htmlFor={titleId} className="text-muted-foreground text-xs">
          {S.titleFilterLabel}
        </label>
        <Input
          id={titleId}
          value={value.title}
          placeholder={S.titleFilterPlaceholder}
          onChange={(event) => {
            onChange({ ...value, title: event.target.value });
          }}
        />
      </div>
      <div className="flex min-w-56 flex-col gap-1">
        <span id={seniorityId} className="text-muted-foreground text-xs">
          {S.seniorityFilterLabel}
        </span>
        <MultiCombobox
          values={value.seniorities}
          options={SENIORITY_OPTIONS}
          ariaLabel={S.seniorityFilterLabel}
          placeholder={S.seniorityAny}
          onChange={(seniorities) => {
            onChange({ ...value, seniorities: seniorities.filter(isSeniority) });
          }}
        />
      </div>
      <Button type="submit" disabled={busy}>
        {busy ? S.searching : S.search}
      </Button>
    </form>
  );
}
