import { z } from "zod";
import { DEAL_SIDEBAR_SECTION_IDS } from "@/constants/dealSidebarSections";

export const DENSITY_VALUES = ["comfortable", "compact"] as const;
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
export const UI_FLAG_KEYS = [
  "usPhoneFormat",
  "winSound",
  "emailLinksNewTab",
  "prefillParticipantsAsRecipients",
  "autoPrefixLeadDealTitles",
] as const;
export type UiFlagKey = (typeof UI_FLAG_KEYS)[number];
// Boundary schema for the generic flag action: validates the key against the allowed set.
export const uiFlagInputSchema = z.object({
  key: z.enum(UI_FLAG_KEYS),
  value: z.boolean(),
});

// Persisted visible-column order for a list table (deals list, people, orgs). Each list stores its
// own top-level ui key (like leadsView) so the jsonb shallow-merge in setPreferences cannot
// lost-update one list's columns when another is written.
export const columnOrderSchema = z.array(z.string());
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

export const uiSchema = z.object({
  dealHeaderBlocks: dealHeaderBlocksSchema.optional(),
  dealSidebarSections: dealSidebarSectionsSchema.optional(),
  leadsView: leadsViewSchema.optional(),
  scheduleFollowUpAfterWon: scheduleFollowUpAfterWonSchema.optional(),
  dealsListView: columnOrderSchema.optional(),
  peopleView: columnOrderSchema.optional(),
  orgsView: columnOrderSchema.optional(),
  openDetailsAfterCreate: openDetailsAfterCreateSchema.optional(),
  usPhoneFormat: z.boolean().optional(),
  winSound: z.boolean().optional(),
  emailLinksNewTab: z.boolean().optional(),
  prefillParticipantsAsRecipients: z.boolean().optional(),
  autoPrefixLeadDealTitles: z.boolean().optional(),
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
