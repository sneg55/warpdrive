import Link from "next/link";
import type { ReactNode } from "react";
import { STRINGS } from "@/constants/strings";
import { can } from "@/features/permissions/can";
import { createContext } from "@/server/trpc/context";
import { SettingsHeading } from "../SettingsHeading";
import { ImportHistory } from "./ImportHistory";

export const metadata = { title: STRINGS.settings.importer.title };

// Import history (settings section 10): gated on data.import. Lists the actor's past import
// runs; the wizard itself moved to /settings/import/new.
export default async function ImportPage(): Promise<ReactNode> {
  const { actor } = await createContext();
  if (actor === null) {
    return <p className="text-sm text-red-600">{STRINGS.settings.requiresAuth}</p>;
  }
  if (!can(actor, "data.import")) {
    return <p className="text-sm text-red-600">{STRINGS.settings.importer.requiresImport}</p>;
  }
  return (
    <section>
      <SettingsHeading
        title={STRINGS.settings.importer.title}
        description={STRINGS.settings.importer.subtitle}
        actions={
          <Link
            href="/settings/import/new"
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-transform hover:opacity-90 active:scale-[0.96]"
          >
            {STRINGS.settings.importer.newImport}
          </Link>
        }
      />
      <ImportHistory />
    </section>
  );
}
