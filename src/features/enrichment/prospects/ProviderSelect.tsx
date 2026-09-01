"use client";

import type React from "react";
import { Select } from "@/components/ui/Select";
import { ENRICHMENT_STRINGS } from "@/constants/enrichmentStrings";
import { ENRICHMENT_PROVIDER_IDS, type ProviderId } from "../providers/types";

const S = ENRICHMENT_STRINGS.prospects;
const NAMES = ENRICHMENT_STRINGS.settings.providerNames;

function isProviderId(value: string): value is ProviderId {
  return (ENRICHMENT_PROVIDER_IDS as readonly string[]).includes(value);
}

export function ProviderSelect({
  value,
  providers,
  onChange,
}: {
  value: ProviderId;
  providers: readonly ProviderId[];
  onChange: (provider: ProviderId) => void;
}): React.ReactNode {
  return (
    <div className="flex min-w-40 flex-col gap-1">
      <span className="text-muted-foreground text-xs">{S.providerLabel}</span>
      <Select
        value={value}
        ariaLabel={S.providerLabel}
        options={providers.map((provider) => ({ value: provider, label: NAMES[provider] }))}
        onChange={(next) => {
          if (isProviderId(next)) onChange(next);
        }}
      />
    </div>
  );
}
