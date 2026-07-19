import type { ReactNode } from "react";
import { BUILTIN_FIELDS } from "@/constants/builtinFields";
import { CUSTOM_FIELD_TARGETS, type CustomFieldTarget } from "@/constants/customFieldTypes";
import { PERMISSION_FLAGS } from "@/constants/permissionFlags";
import { STRINGS } from "@/constants/strings";
import { db } from "@/db/client";
import { listDefs } from "@/features/custom-fields/defsRepo";
import { listHiddenBuiltins } from "@/features/custom-fields/hiddenBuiltinsRepo";
import { createContext } from "@/server/trpc/context";
import { DataFieldsClient } from "./DataFieldsClient";
import type { BuiltinRow, FieldRow } from "./types";

export const metadata = { title: STRINGS.settings.dataFields };

// Data fields admin page (spec 7): gated on metadata.manage (the same gate the def actions
// enforce). List, create, archive, rename, reorder, and option editing.
export default async function DataFieldsPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string }>;
}): Promise<ReactNode> {
  const { entity } = await searchParams;
  const initialTarget: CustomFieldTarget = CUSTOM_FIELD_TARGETS.includes(
    entity as CustomFieldTarget,
  )
    ? (entity as CustomFieldTarget)
    : "deal";
  const { actor } = await createContext();
  if (
    actor === null ||
    (actor.type !== "admin" && !actor.flags.has(PERMISSION_FLAGS.METADATA_MANAGE))
  ) {
    return <p className="text-sm text-red-600">{STRINGS.settings.requiresAdmin}</p>;
  }

  const signal = AbortSignal.timeout(5000);
  // The hidden-builtins read and the four per-target def reads are all independent; run them
  // concurrently instead of five serial round trips (one listHiddenBuiltins + a listDefs loop).
  const [hidden, defsPerTarget] = await Promise.all([
    listHiddenBuiltins(db, signal),
    Promise.all(
      CUSTOM_FIELD_TARGETS.map(async (target) => ({
        target,
        defs: await listDefs(db, target, {}, signal),
      })),
    ),
  ]);
  const byTarget: Record<string, FieldRow[]> = {};
  const builtinByTarget: Record<string, BuiltinRow[]> = {};
  for (const { target, defs } of defsPerTarget) {
    byTarget[target] = defs.map((d) => ({
      id: d.id,
      name: d.name,
      type: d.type,
      options: d.options,
      isImportant: d.isImportant,
      showInAddForm: d.showInAddForm,
    }));
    builtinByTarget[target] = BUILTIN_FIELDS[target].map((f) => ({
      key: f.key,
      label: f.label,
      locked: f.locked,
      hidden: hidden[target].has(f.key),
    }));
  }

  return (
    <DataFieldsClient
      byTarget={byTarget}
      builtinByTarget={builtinByTarget}
      initialTarget={initialTarget}
    />
  );
}
