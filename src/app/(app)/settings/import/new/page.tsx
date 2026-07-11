import type { ReactNode } from "react";
import { STRINGS } from "@/constants/strings";
import { db } from "@/db/client";
import { listDefs } from "@/features/custom-fields/defsRepo";
import { listHiddenBuiltins } from "@/features/custom-fields/hiddenBuiltinsRepo";
import { can } from "@/features/permissions/can";
import { createContext } from "@/server/trpc/context";
import { ImportWizard } from "../ImportWizard";

export const metadata = { title: STRINGS.settings.importer.title };

// New CSV import (settings section 10): gated on data.import (the same flag the import server
// actions enforce). Targets person/organization/deal/lead/activity; the custom-field defs for
// every target that supports them (all but lead) are prefetched so the mapping step can offer
// them without a client round-trip.
export default async function NewImportPage(): Promise<ReactNode> {
  const { actor } = await createContext();
  if (actor === null) {
    return <p className="text-sm text-red-600">{STRINGS.settings.requiresAuth}</p>;
  }
  if (!can(actor, "data.import")) {
    return <p className="text-sm text-red-600">{STRINGS.settings.importer.requiresImport}</p>;
  }

  const signal = AbortSignal.timeout(5000);
  const personDefs = await listDefs(db, "person", {}, signal);
  const orgDefs = await listDefs(db, "organization", {}, signal);
  const dealDefs = await listDefs(db, "deal", {}, signal);
  const activityDefs = await listDefs(db, "activity", {}, signal);
  const hidden = await listHiddenBuiltins(db, signal);
  const hiddenBuiltins = {
    person: [...hidden.person],
    organization: [...hidden.organization],
    deal: [...hidden.deal],
    activity: [...hidden.activity],
  };

  return (
    <ImportWizard
      personDefs={personDefs}
      orgDefs={orgDefs}
      dealDefs={dealDefs}
      activityDefs={activityDefs}
      hiddenBuiltins={hiddenBuiltins}
    />
  );
}
