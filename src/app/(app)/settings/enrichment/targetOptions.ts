import type { SelectOption } from "@/components/ui/Select";
import { isImportFieldHidden } from "@/constants/builtinFields";
import { ENRICHMENT_STRINGS } from "@/constants/enrichmentStrings";
import {
  canonicalField,
  canonicalKeysFor,
  type EnrichEntity,
  valueTypeOf,
} from "@/features/enrichment/canonical";
import {
  builtinAcceptsCanonical,
  NUMBER_TARGET_TYPES,
  STRING_TARGET_TYPES,
} from "@/features/enrichment/targetTypes";
import type { ResolvedMapping } from "@/features/enrichment/types";
import type { MappingRow } from "./MappingTable";

const S = ENRICHMENT_STRINGS.settings;

export type MappingTarget =
  | { kind: "builtin"; key: string }
  | { kind: "custom"; fieldDefId: string };

// One <Select> offers built-in and custom targets side by side, so each option value carries its
// own kind. The server action re-validates whatever comes back through it.
export const NOT_MAPPED_VALUE = "";
const BUILTIN_PREFIX = "builtin:";
const CUSTOM_PREFIX = "custom:";

export function encodeTarget(target: MappingTarget): string {
  return target.kind === "builtin"
    ? `${BUILTIN_PREFIX}${target.key}`
    : `${CUSTOM_PREFIX}${target.fieldDefId}`;
}

export function decodeTarget(value: string): MappingTarget | null {
  if (value.startsWith(BUILTIN_PREFIX)) {
    return { kind: "builtin", key: value.slice(BUILTIN_PREFIX.length) };
  }
  if (value.startsWith(CUSTOM_PREFIX)) {
    return { kind: "custom", fieldDefId: value.slice(CUSTOM_PREFIX.length) };
  }
  return null;
}

export interface CustomFieldTargetDef {
  id: string;
  name: string;
  type: string;
}

// Mirrors the type gate in features/enrichment/mappingsRepo, which is the authority: a save that
// disagrees with this list is rejected there with ENRICH_MAPPING_INVALID.

function customOptionsFor(canonicalKey: string, defs: CustomFieldTargetDef[]): SelectOption[] {
  const valueType = valueTypeOf(canonicalKey);
  const accepted = valueType === "number" ? NUMBER_TARGET_TYPES : STRING_TARGET_TYPES;
  return defs
    .filter((d) => accepted.has(d.type))
    .map((d) => ({
      value: encodeTarget({ kind: "custom", fieldDefId: d.id }),
      label: d.name,
      group: S.mappingCustomGroup,
    }));
}

function currentValue(mapping: ResolvedMapping | undefined): string {
  if (mapping === undefined) return NOT_MAPPED_VALUE;
  if (mapping.targetKind === "builtin") {
    return mapping.targetKey === null
      ? NOT_MAPPED_VALUE
      : encodeTarget({ kind: "builtin", key: mapping.targetKey });
  }
  return mapping.targetFieldDefId === null
    ? NOT_MAPPED_VALUE
    : encodeTarget({ kind: "custom", fieldDefId: mapping.targetFieldDefId });
}

// A target holds at most one canonical key: mappingsRepo refuses a claimed one and two partial
// unique indexes back that up, so the owner of each claimed target is tracked by encoded value.
function ownersByTarget(mappings: ResolvedMapping[]): Map<string, string> {
  const owners = new Map<string, string>();
  for (const mapping of mappings) {
    const encoded = currentValue(mapping);
    if (encoded !== NOT_MAPPED_VALUE) owners.set(encoded, mapping.canonicalKey);
  }
  return owners;
}

// One row per canonical key of the entity, whether or not it is mapped: an unmapped key is a
// choice an admin has to be able to see and make, not a row that disappears.
export function buildMappingRows(
  entity: EnrichEntity,
  builtinOptions: SelectOption[],
  mappings: ResolvedMapping[],
  defs: CustomFieldTargetDef[],
  hiddenBuiltins: ReadonlySet<string>,
): MappingRow[] {
  const byKey = new Map(mappings.map((m) => [m.canonicalKey, m]));
  const owners = ownersByTarget(mappings);
  // A built-in hidden in Settings > Data fields is not offered: enrichment does not write it
  // (mappingsRepo drops the mapping), so mapping onto it would be a menu entry that does nothing.
  const offered = builtinOptions.filter(
    (o) => !isImportFieldHidden(o.value.slice(BUILTIN_PREFIX.length), hiddenBuiltins),
  );
  return canonicalKeysFor(entity).map((canonicalKey) => {
    // Same rules the save applies, so the menu cannot offer a target that would then be refused:
    // the type gate, then every target another row already claims.
    const compatible = [
      ...offered
        .filter((o) => builtinAcceptsCanonical(o.value.slice(BUILTIN_PREFIX.length), canonicalKey))
        .map((o) => ({ ...o, group: S.mappingBuiltinGroup })),
      ...customOptionsFor(canonicalKey, defs),
    ];
    return {
      canonicalKey,
      label: canonicalField(canonicalKey)?.label ?? canonicalKey,
      value: currentValue(byKey.get(canonicalKey)),
      options: [
        { value: NOT_MAPPED_VALUE, label: S.mappingNotMapped },
        ...compatible.filter((o) => {
          const owner = owners.get(o.value);
          return owner === undefined || owner === canonicalKey;
        }),
      ],
    };
  });
}
