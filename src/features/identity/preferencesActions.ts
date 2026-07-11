"use server";

import { ERROR_IDS } from "@/constants/errorIds";
import { db } from "@/db/client";
import { guardCsrf } from "@/features/identity/actions/shared";
import { SIG } from "@/features/identity/actions/sig";
import { createContext } from "@/server/trpc/context";
import { setPreferences, setSidebarSectionsPreference } from "./preferencesRepo";
import {
  COLUMN_VIEW_KEYS,
  type ColumnViewName,
  columnViewInputSchema,
  dealHeaderBlocksSchema,
  dealSidebarSectionsSchema,
  leadsViewSchema,
  openDetailsAfterCreateSchema,
  type ProfilePrefs,
  profilePrefsSchema,
  scheduleFollowUpAfterWonSchema,
  type UiFlagKey,
  uiFlagInputSchema,
} from "./preferencesSchema";

export type PrefActionResult = { ok: true } | { ok: false; error: { id: string } };

async function actorId(
  csrfToken: string | null,
): Promise<{ ok: true; id: string } | { ok: false; error: { id: string } }> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };
  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };
  return { ok: true, id: actor.id };
}

export async function updateProfilePreferencesAction(
  input: ProfilePrefs,
  csrfToken: string | null = null,
): Promise<PrefActionResult> {
  const a = await actorId(csrfToken);
  if (!a.ok) return a;
  const parsed = profilePrefsSchema.parse(input);
  await setPreferences(db, a.id, parsed, SIG());
  return { ok: true };
}

export async function setDealHeaderBlocksAction(
  input: { blocks: string[] },
  csrfToken: string | null = null,
): Promise<PrefActionResult> {
  const a = await actorId(csrfToken);
  if (!a.ok) return a;
  const blocks = dealHeaderBlocksSchema.parse(input.blocks);
  await setPreferences(db, a.id, { ui: { dealHeaderBlocks: blocks } }, SIG());
  return { ok: true };
}

export async function setSidebarSectionsAction(
  input: { sections: unknown[] },
  csrfToken: string | null = null,
): Promise<PrefActionResult> {
  const a = await actorId(csrfToken);
  if (!a.ok) return a;
  const sections = dealSidebarSectionsSchema.parse(input.sections);
  await setSidebarSectionsPreference(db, a.id, sections, SIG());
  return { ok: true };
}

export async function setLeadsViewAction(
  input: { columns: string[]; sort: { field: string; dir: "asc" | "desc" } },
  csrfToken: string | null = null,
): Promise<PrefActionResult> {
  const a = await actorId(csrfToken);
  if (!a.ok) return a;
  const leadsView = leadsViewSchema.parse(input);
  await setPreferences(db, a.id, { ui: { leadsView } }, SIG());
  return { ok: true };
}

// Generic list-table column-order persist. `view` selects which top-level ui key is written
// (dealsListView / peopleView / orgsView), each a distinct key so concurrent writes to different
// lists never lost-update one another via the jsonb shallow merge.
export async function setColumnViewAction(
  input: { view: ColumnViewName; columns: string[] },
  csrfToken: string | null = null,
): Promise<PrefActionResult> {
  const a = await actorId(csrfToken);
  if (!a.ok) return a;
  const parsed = columnViewInputSchema.parse(input);
  const uiKey = COLUMN_VIEW_KEYS[parsed.view];
  await setPreferences(db, a.id, { ui: { [uiKey]: parsed.columns } }, SIG());
  return { ok: true };
}

export async function setScheduleFollowUpAfterWonAction(
  input: { enabled: boolean },
  csrfToken: string | null = null,
): Promise<PrefActionResult> {
  const a = await actorId(csrfToken);
  if (!a.ok) return a;
  const enabled = scheduleFollowUpAfterWonSchema.parse(input.enabled);
  await setPreferences(db, a.id, { ui: { scheduleFollowUpAfterWon: enabled } }, SIG());
  return { ok: true };
}

// Generic boolean Interface-flag persist. `key` is validated against the whitelist enum so a
// client cannot write an arbitrary ui key; each flag is its own top-level ui key, so the jsonb
// shallow merge never lost-updates a sibling flag.
export async function setUiFlagAction(
  input: { key: UiFlagKey; value: boolean },
  csrfToken: string | null = null,
): Promise<PrefActionResult> {
  const a = await actorId(csrfToken);
  if (!a.ok) return a;
  const { key, value } = uiFlagInputSchema.parse(input);
  await setPreferences(db, a.id, { ui: { [key]: value } }, SIG());
  return { ok: true };
}

// "Open details view after creating a new item", written whole each time because the jsonb
// shallow merge replaces the nested object rather than merging into it.
export async function setOpenDetailsAfterCreateAction(
  input: { leadDeal: boolean; person: boolean; org: boolean },
  csrfToken: string | null = null,
): Promise<PrefActionResult> {
  const a = await actorId(csrfToken);
  if (!a.ok) return a;
  const openDetailsAfterCreate = openDetailsAfterCreateSchema.parse(input);
  await setPreferences(db, a.id, { ui: { openDetailsAfterCreate } }, SIG());
  return { ok: true };
}
