import { z } from "zod";
import { MAX_DAILY_ACTIVITY_TARGET, MIN_DAILY_ACTIVITY_TARGET } from "@/constants/activityLoad";
import { DEAL_SIDEBAR_SECTION_IDS } from "@/constants/dealSidebarSections";
import { BOARD_SORT_KEYS } from "@/features/deals/boardSort";
import { filterDefinition } from "@/features/saved-filters/schemas";
import { APPEARANCE_VALUES } from "@/features/theme/appearance";

// Lives here, not beside APPEARANCE_VALUES: that module is imported by the root layout, so a zod
// import there would ship the parser on every route.
export const appearanceSchema = z.enum(APPEARANCE_VALUES);

const DENSITY_VALUES = ["comfortable", "compact"] as const;
export type Density = (typeof DENSITY_VALUES)[number];
export const densitySchema = z.enum(DENSITY_VALUES);

// Open-ended UI-state keys. Each is optional; absent means "use the consumer's own default".
export const dealHeaderBlocksSchema = z.array(z.string());
export const dealSidebarSectionsSchema = z.array(
  z.object({
    id: z.enum(DEAL_SIDEBAR_SECTION_IDS),
    visible: z.boolean(),
  }),
);
export const leadsViewSchema = z.object({
  columns: z.array(z.string()),
  sort: z.object({ field: z.string(), dir: z.enum(["asc", "desc"]) }),
});
// The deals board toolbar view: owner filter, sort field + direction, and the applied filter
// (a saved view by id, or the ad-hoc condition builder's definition). The pipeline is not stored,
// it lives in the URL.
export const boardViewSchema = z.object({
  ownerId: z.string().uuid().nullable().default(null),
  sortKey: z.enum(BOARD_SORT_KEYS),
  sortDir: z.enum(["asc", "desc"]),
  savedFilterId: z.string().uuid().nullable().default(null),
  conditions: filterDefinition.nullable().default(null),
});
export type BoardViewPrefs = z.infer<typeof boardViewSchema>;
// Personal preference: after marking a deal Won, prompt to schedule a follow-up activity.
export const scheduleFollowUpAfterWonSchema = z.boolean();

// Interface preferences (Pipedrive-parity personal settings). Each drives one app behavior.
// "Open details view after creating a new item", stored per entity type so each can toggle
// independently (Pipedrive's Project sub-option is dropped, Projects are out of scope).
export const openDetailsAfterCreateSchema = z.object({
  leadDeal: z.boolean(),
  person: z.boolean(),
  org: z.boolean(),
});
export type OpenDetailsAfterCreate = z.infer<typeof openDetailsAfterCreateSchema>;
// The five scalar Interface flags. Each is its own top-level ui key so the jsonb shallow-merge
// in setPreferences cannot lost-update one flag when another is written.
const UI_FLAG_KEYS = [
  "usPhoneFormat",
  "winSound",
  "emailLinksNewTab",
  "prefillParticipantsAsRecipients",
  "autoPrefixLeadDealTitles",
  "scheduleFollowUpAfterDone",
] as const;
export type UiFlagKey = (typeof UI_FLAG_KEYS)[number];
// Boundary schema for the generic flag action: validates the key against the allowed set.
export const uiFlagInputSchema = z.object({
  key: z.enum(UI_FLAG_KEYS),
  value: z.boolean(),
});

// Personal daily activity target: how many activities a day should hold before it reads as full.
// Drives the load dots under each day in the activity date pickers; never blocks a create.
export const dailyActivityTargetSchema = z
  .number()
  .int()
  .min(MIN_DAILY_ACTIVITY_TARGET)
  .max(MAX_DAILY_ACTIVITY_TARGET);

// Persisted visible-column order for a list table (deals list, people, orgs). Each list stores its
// own top-level ui key (like leadsView) so the jsonb shallow-merge in setPreferences cannot
// lost-update one list's columns when another is written.
const columnOrderSchema = z.array(z.string());
// The list-table views that persist a customized column order. Guards the generic column action.
export const COLUMN_VIEW_KEYS = {
  dealsList: "dealsListView",
  people: "peopleView",
  orgs: "orgsView",
} as const;
export type ColumnViewName = keyof typeof COLUMN_VIEW_KEYS;
// Boundary schema for the generic column-view action: validates the view name against the allowed
// set (a client sends this) plus the column-order array.
export const columnViewInputSchema = z.object({
  view: z.enum(["dealsList", "people", "orgs"]),
  columns: columnOrderSchema,
});

// Read-side shape of the stored jsonb bag (getPreferences is its only consumer; every write
// validates against the individual schemas above). Each key carries .catch(undefined) so one stale
// value, a retired enum member or a hand-edited row, drops only its own key. Without it a single
// bad key failed the whole object and getPreferences fell back to {}, silently resetting every
// unrelated preference on load.
export const uiSchema = z.object({
  dealHeaderBlocks: dealHeaderBlocksSchema.optional().catch(undefined),
  dealSidebarSections: dealSidebarSectionsSchema.optional().catch(undefined),
  leadsView: leadsViewSchema.optional().catch(undefined),
  boardView: boardViewSchema.optional().catch(undefined),
  scheduleFollowUpAfterWon: scheduleFollowUpAfterWonSchema.optional().catch(undefined),
  dealsListView: columnOrderSchema.optional().catch(undefined),
  peopleView: columnOrderSchema.optional().catch(undefined),
  orgsView: columnOrderSchema.optional().catch(undefined),
  openDetailsAfterCreate: openDetailsAfterCreateSchema.optional().catch(undefined),
  usPhoneFormat: z.boolean().optional().catch(undefined),
  winSound: z.boolean().optional().catch(undefined),
  emailLinksNewTab: z.boolean().optional().catch(undefined),
  prefillParticipantsAsRecipients: z.boolean().optional().catch(undefined),
  autoPrefixLeadDealTitles: z.boolean().optional().catch(undefined),
  scheduleFollowUpAfterDone: z.boolean().optional().catch(undefined),
  // Day / Night / System. The durable, cross-device record; the wd_appearance cookie is only a
  // mirror so the no-flash script can settle the theme before first paint.
  appearance: appearanceSchema.optional().catch(undefined),
  dailyActivityTarget: dailyActivityTargetSchema.optional().catch(undefined),
});
export type UiPrefs = z.infer<typeof uiSchema>;

// timezone: null clears it (fall back to browser/Google). Non-empty IANA-ish string otherwise.
export const profilePrefsSchema = z.object({
  timezone: z.string().min(1).nullable(),
  density: densitySchema,
});
export type ProfilePrefs = z.infer<typeof profilePrefsSchema>;

export type Preferences = { timezone: string | null; density: Density; ui: UiPrefs };
export const PREFERENCES_DEFAULT: Preferences = { timezone: null, density: "comfortable", ui: {} };
