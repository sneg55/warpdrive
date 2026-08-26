import type { ReactNode } from "react";
import type { SelectOption } from "@/components/ui/Select";
import { BUILTIN_FIELDS } from "@/constants/builtinFields";
import { ENRICHMENT_STRINGS } from "@/constants/enrichmentStrings";
import type { EnrichEntity } from "@/features/enrichment/canonical";
import { WRITABLE_BUILTIN_TARGETS } from "@/features/enrichment/mappingsRepo";
import { ENTITY_FIELDS } from "@/features/import/importFields";
import { createContext } from "@/server/trpc/context";
import { createCaller } from "@/server/trpc/root";
import { SettingsHeading } from "../SettingsHeading";
import { SettingsPage } from "../SettingsSurface";
import { EnrichmentClient } from "./EnrichmentClient";
import { buildMappingRows, encodeTarget } from "./targetOptions";

const S = ENRICHMENT_STRINGS.settings;

export const metadata = { title: S.title };

// Built-in targets carry their label in two catalogues: the data-fields one for plain columns, the
// import one for the address leaves. Both are keyed the same way, so one lookup covers both.
function builtinLabel(entity: EnrichEntity, key: string): string {
  const builtin = BUILTIN_FIELDS[entity].find((f) => f.key === key);
  if (builtin !== undefined) return builtin.label;
  return ENTITY_FIELDS[entity].find((f) => f.field === key)?.label ?? key;
}

function builtinOptionsFor(entity: EnrichEntity): SelectOption[] {
  return [...WRITABLE_BUILTIN_TARGETS[entity]].map((key) => ({
    value: encodeTarget({ kind: "builtin", key }),
    label: builtinLabel(entity, key),
  }));
}

export default async function EnrichmentSettingsPage(): Promise<ReactNode> {
  const ctx = await createContext();
  // Server-side gate: the nav hides this page for a non-admin, but hiding is not a boundary.
  if (ctx.actor === null || ctx.actor.type !== "admin") {
    return <p className="text-sm text-red-600">{S.adminOnly}</p>;
  }

  const caller = createCaller(ctx);
  const [config, personDefs, orgDefs, hiddenBuiltins] = await Promise.all([
    caller.enrichment.config(),
    caller.customFields.listDefs({ target: "person" }),
    caller.customFields.listDefs({ target: "organization" }),
    caller.customFields.hiddenBuiltins(),
  ]);
  const hiddenPerson = new Set(hiddenBuiltins.person);
  const hiddenOrg = new Set(hiddenBuiltins.organization);

  return (
    <SettingsPage>
      <SettingsHeading title={S.title} description={S.description} />
      <EnrichmentClient
        providers={config.providers.map((p) => ({
          provider: p.provider,
          name: S.providerNames[p.provider],
          enabled: p.enabled,
          hasKey: p.hasKey,
          apiKeyHint: p.apiKeyHint,
          throttledUntilIso: p.throttledUntil?.toISOString() ?? null,
          throttleReason: p.throttleReason,
          needsAttention: p.needsAttention,
        }))}
        person={{
          entity: "person",
          title: S.mappingPerson,
          rows: buildMappingRows(
            "person",
            builtinOptionsFor("person"),
            config.personMappings,
            personDefs,
            hiddenPerson,
          ),
          hasCustomFields: personDefs.length > 0,
        }}
        organization={{
          entity: "organization",
          title: S.mappingOrganization,
          rows: buildMappingRows(
            "organization",
            builtinOptionsFor("organization"),
            config.orgMappings,
            orgDefs,
            hiddenOrg,
          ),
          hasCustomFields: orgDefs.length > 0,
        }}
        cacheTtlDays={config.cacheTtlDays}
      />
    </SettingsPage>
  );
}
