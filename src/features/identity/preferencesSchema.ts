import { z } from "zod";
import { MAX_DAILY_ACTIVITY_TARGET, MIN_DAILY_ACTIVITY_TARGET } from "@/constants/activityLoad";
import { DEAL_SIDEBAR_SECTION_IDS } from "@/constants/dealSidebarSections";
import { BOARD_SORT_KEYS } from "@/features/deals/boardSort";
import { filterDefinition } from "@/features/saved-filters/schemas";
import { APPEARANCE_VALUES } from "@/features/theme/appearance";

export const appearanceSchema = z.enum(APPEARANCE_VALUES);

const DENSITY_VALUES = ["comfortable", "compact"] as const;
export type Density = (typeof DENSITY_VALUES)[number];
export const densitySchema = z.enum(DENSITY_VALUES);

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
export const boardViewSchema = z.object({
  ownerId: z.string().uuid().nullable().default(null),
  sortKey: z.enum(BOARD_SORT_KEYS),
  sortDir: z.enum(["asc", "desc"]),
  savedFilterId: z.string().uuid().nullable().default(null),
  conditions: filterDefinition.nullable().default(null),
});
export type BoardViewPrefs = z.infer<typeof boardViewSchema>;
export const scheduleFollowUpAfterWonSchema = z.boolean();

export const openDetailsAfterCreateSchema = z.object({
  leadDeal: z.boolean(),
  person: z.boolean(),
  org: z.boolean(),
});
export type OpenDetailsAfterCreate = z.infer<typeof openDetailsAfterCreateSchema>;
const UI_FLAG_KEYS = [
  "usPhoneFormat",
  "winSound",
  "emailLinksNewTab",
  "prefillParticipantsAsRecipients",
  "autoPrefixLeadDealTitles",
  "scheduleFollowUpAfterDone",
] as const;
export type UiFlagKey = (typeof UI_FLAG_KEYS)[number];
export const uiFlagInputSchema = z.object({
  key: z.enum(UI_FLAG_KEYS),
  value: z.boolean(),
});

export const dailyActivityTargetSchema = z
  .number()
  .int()
  .min(MIN_DAILY_ACTIVITY_TARGET)
  .max(MAX_DAILY_ACTIVITY_TARGET);

const columnOrderSchema = z.array(z.string());
export const COLUMN_VIEW_KEYS = {
  dealsList: "dealsListView",
  people: "peopleView",
  orgs: "orgsView",
} as const;
export type ColumnViewName = keyof typeof COLUMN_VIEW_KEYS;
export const columnViewInputSchema = z.object({
  view: z.enum(["dealsList", "people", "orgs"]),
  columns: columnOrderSchema,
});

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
  appearance: appearanceSchema.optional().catch(undefined),
  dailyActivityTarget: dailyActivityTargetSchema.optional().catch(undefined),
});
export type UiPrefs = z.infer<typeof uiSchema>;

export const profilePrefsSchema = z.object({
  timezone: z.string().min(1).nullable(),
  density: densitySchema,
});
export type ProfilePrefs = z.infer<typeof profilePrefsSchema>;

export type Preferences = { timezone: string | null; density: Density; ui: UiPrefs };
export const PREFERENCES_DEFAULT: Preferences = { timezone: null, density: "comfortable", ui: {} };
