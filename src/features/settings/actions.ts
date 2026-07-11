"use server";

import { z } from "zod";
import { db } from "@/db/client";
import { guardCsrf } from "@/features/identity/actions/shared";
import { SIG } from "@/features/identity/actions/sig";
import { recordAudit } from "@/features/identity/audit";
import { createContext } from "@/server/trpc/context";
import { requireManage } from "./adminGate";
import { updateSettings } from "./settingsRepo";

export type SettingsActionResult = { ok: true } | { ok: false; error: { id: string } };

const generalSchema = z.object({ companyName: z.string().trim().max(200) });
const trackingSchema = z.object({ enabled: z.boolean() });

async function gate(
  csrfToken: string | null,
): Promise<{ ok: true; actorId: string } | { ok: false; error: { id: string } }> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };
  const { actor } = await createContext();
  const allowed = requireManage(actor);
  if (!allowed.ok) return allowed;
  return { ok: true, actorId: allowed.value.id };
}

export async function updateCompanyGeneralAction(
  input: z.input<typeof generalSchema>,
  csrfToken: string | null = null,
): Promise<SettingsActionResult> {
  const g = await gate(csrfToken);
  if (!g.ok) return g;
  const parsed = generalSchema.parse(input);
  const row = await updateSettings(db, { companyName: parsed.companyName }, SIG());
  await recordAudit(
    db,
    {
      actorId: g.actorId,
      targetType: "settings",
      targetId: null,
      action: "company.settings.updated",
      after: { companyName: row.companyName },
    },
    SIG(),
  );
  return { ok: true };
}

export async function updateEmailTrackingDefaultAction(
  input: z.input<typeof trackingSchema>,
  csrfToken: string | null = null,
): Promise<SettingsActionResult> {
  const g = await gate(csrfToken);
  if (!g.ok) return g;
  const parsed = trackingSchema.parse(input);
  const row = await updateSettings(db, { emailTrackingDefaultEnabled: parsed.enabled }, SIG());
  await recordAudit(
    db,
    {
      actorId: g.actorId,
      targetType: "settings",
      targetId: null,
      action: "company.settings.updated",
      after: { emailTrackingDefaultEnabled: row.emailTrackingDefaultEnabled },
    },
    SIG(),
  );
  return { ok: true };
}
