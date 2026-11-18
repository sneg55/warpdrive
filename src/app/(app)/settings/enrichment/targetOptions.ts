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

function ownersByTarget(mappings: ResolvedMapping[]): Map<string, string> {
  const owners = new Map<string, string>();
  for (const mapping of mappings) {
    const encoded = currentValue(mapping);
    if (encoded !== NOT_MAPPED_VALUE) owners.set(encoded, mapping.canonicalKey);
  }
  return owners;
}

export function buildMappingRows(
  entity: EnrichEntity,
  builtinOptions: SelectOption[],
  mappings: ResolvedMapping[],
  defs: CustomFieldTargetDef[],
  hiddenBuiltins: ReadonlySet<string>,
): MappingRow[] {
  const byKey = new Map(mappings.map((m) => [m.canonicalKey, m]));
  const owners = ownersByTarget(mappings);
  const offered = builtinOptions.filter(
    (o) => !isImportFieldHidden(o.value.slice(BUILTIN_PREFIX.length), hiddenBuiltins),
  );
  return canonicalKeysFor(entity).map((canonicalKey) => {
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
