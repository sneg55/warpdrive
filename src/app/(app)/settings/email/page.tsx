import type { ReactNode } from "react";
import { STRINGS } from "@/constants/strings";
import { db } from "@/db/client";
import { listSignatures, listTemplatesForSettings } from "@/features/email/emailAuthoringReads";
import { createContext } from "@/server/trpc/context";
import { SettingsHeading } from "../SettingsHeading";
import { SignaturesSettingsClient } from "./SignaturesSettingsClient";
import { EMAIL_SETTINGS_STRINGS } from "./strings";
import { TemplatesSettingsClient } from "./TemplatesSettingsClient";

export const metadata = { title: STRINGS.settings.emailTemplates };

// Email settings: manage templates (own + shared) and signatures. Reads run with the trusted
// actor; the client components call server actions and router.refresh() to re-fetch.
export default async function EmailSettingsPage(): Promise<ReactNode> {
  const ctx = await createContext();
  if (ctx.actor === null) return null;
  const signal = AbortSignal.timeout(15_000);
  const [templates, signatures] = await Promise.all([
    listTemplatesForSettings(db, { actor: ctx.actor }, signal),
    listSignatures(db, { actor: ctx.actor }, signal),
  ]);
  const canShare = ctx.actor.flags.has("filter.share");
  return (
    <div className="max-w-3xl space-y-8">
      <SettingsHeading
        title={STRINGS.settings.emailTemplates}
        description={EMAIL_SETTINGS_STRINGS.description}
      />
      <TemplatesSettingsClient templates={templates} canShare={canShare} />
      <SignaturesSettingsClient signatures={signatures} />
    </div>
  );
}
