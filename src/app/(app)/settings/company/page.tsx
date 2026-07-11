import { eq } from "drizzle-orm";
import type { ReactNode } from "react";
import { PERMISSION_FLAGS } from "@/constants/permissionFlags";
import { STRINGS } from "@/constants/strings";
import { db } from "@/db/client";
import { settings } from "@/db/schema/system";
import { createContext } from "@/server/trpc/context";
import { CompanyGeneralClient } from "./CompanyGeneralClient";

export const metadata = { title: STRINGS.settings.companyGeneral };

// Company settings > General tab. The tab strip lives in company/layout.tsx, so this page renders
// only the General content (no extra heading). Admin-gated like the other company catalog pages.
export default async function CompanyGeneralPage(): Promise<ReactNode> {
  const { actor } = await createContext();
  if (actor === null || (actor.type !== "admin" && !actor.flags.has(PERMISSION_FLAGS.MANAGE))) {
    return <p className="text-sm text-red-600">{STRINGS.settings.requiresAdmin}</p>;
  }

  const [row] = await db
    .select({ companyName: settings.companyName, baseCurrency: settings.baseCurrency })
    .from(settings)
    .where(eq(settings.id, true));

  return (
    <CompanyGeneralClient
      companyName={row?.companyName ?? ""}
      baseCurrency={row?.baseCurrency ?? "USD"}
    />
  );
}
