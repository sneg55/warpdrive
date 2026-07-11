// CSV-boundary schemas for the deal/lead/activity import targets (STANDARD_IMPORT_FIELDS'
// shape for each). These validate only the STATIC shape (required fields, numeric/date
// coercion); referential fields (a deal's pipeline/stage NAMES, an activity's typeKey) stay
// as raw strings here and are resolved to real ids later, at commit time (commitDeal.ts /
// commitActivity.ts), since that resolution needs a DB lookup and the referenced row could
// change between validate and commit.
import { z } from "zod";
import { SOURCE_CHANNEL_KEYS } from "@/constants/sourceChannels";
import {
  MAX_DOMAIN_LEN,
  MAX_INDUSTRY_LEN,
  MAX_LINKEDIN_URL_LEN,
  personCreateInput,
} from "@/features/contacts/schemas";

// CSV cells arrive as strings; z.coerce.number() converts (or fails on non-numeric input,
// which is reported as a row error rather than silently coerced to null).
const currencyValue = z.coerce.number().nonnegative().nullable().default(null);

// The organization block of a cross-entity row (a lead/deal/person row that also names its org).
// `name` is required whenever the block exists at all: it is the key resolveOrgLink find-or-creates
// on, so an org block without one has nowhere to go. Firmographics live on orgUpdateInput rather
// than orgCreateInput, so commit creates the org by name and then applies these through updateOrg.
//
// Every optional field is `.optional()`, never `.nullable().default(null)`. updateOrg reads an
// explicit null as "clear this column", so defaulting an UNMAPPED field to null would wipe the
// existing domain/industry/revenue off every org an "update"-mode import touched.
export const orgImportGroupSchema = z.object({
  name: z.string().trim().min(1).max(255),
  domain: z.string().trim().max(MAX_DOMAIN_LEN).optional(),
  industry: z.string().trim().max(MAX_INDUSTRY_LEN).optional(),
  linkedinUrl: z.string().trim().max(MAX_LINKEDIN_URL_LEN).optional(),
  employeeCount: z.coerce.number().int().nonnegative().optional(),
  // numeric(14,2) in Postgres; kept a string so a malformed cell fails Zod, not the DB cast.
  annualRevenue: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/)
    .optional(),
  address: z
    .object({
      street: z.string().trim().optional(),
      city: z.string().trim().optional(),
      region: z.string().trim().optional(),
      postal: z.string().trim().optional(),
      country: z.string().trim().optional(),
    })
    .optional(),
});
export type OrgImportGroup = z.infer<typeof orgImportGroupSchema>;

// The person block of a deal row: the contact the deal belongs to, resolved by name or email.
//
// Reuses personCreateInput's own contact-point schemas rather than a loose shape of its own:
// resolvePersonLink creates the person through personCreateInput at commit, so anything this
// accepts and that rejects would show as a valid row in preview and then fail on Import.
export const personImportGroupSchema = personCreateInput.pick({
  name: true,
  emails: true,
  phones: true,
});
export type PersonImportGroup = z.infer<typeof personImportGroupSchema>;

// The 50k cap mirrors noteCreateInput. createNote does not re-parse its input, so a row whose note
// body (a huge mapped cell, or a wide rowNoteFromUnmapped dump) exceeds it would otherwise insert
// an over-length note at commit instead of failing in preview.
export const noteImportGroupSchema = z.object({ body: z.string().trim().min(1).max(50_000) });

export const dealImportRowSchema = z.object({
  title: z.string().min(1).max(255),
  value: currencyValue,
  expectedCloseDate: z.string().date().nullable().default(null),
  pipeline: z.string().trim().min(1).nullable().default(null),
  stage: z.string().trim().min(1).nullable().default(null),
});
export type DealImportRow = z.infer<typeof dealImportRowSchema>;

// A lead's organization is no longer a lead-level "orgName" cell: it lives in the row's
// organization group (orgImportGroupSchema) and is resolved to a real orgId at commit time via
// visibility-scoped find-or-create, since that lookup needs a DB read and the referenced org
// could change between validate and commit.
export const leadImportRowSchema = z.object({
  title: z.string().min(1).max(255),
  value: currencyValue,
  expectedCloseDate: z.string().date().nullable().default(null),
  // The same enum leadCreateInput enforces at commit: a display label ("Outbound") or a typo must
  // fail here, in preview, not after the user clicks Import.
  sourceChannel: z
    .enum(SOURCE_CHANNEL_KEYS as [string, ...string[]])
    .nullable()
    .default(null),
  sourceChannelId: z.string().trim().min(1).max(255).nullable().default(null),
});
export type LeadImportRow = z.infer<typeof leadImportRowSchema>;

// CSV due dates are rarely full ISO datetimes; normalize any Date-parseable string to one so
// activityCreateInput's z.string().datetime() (strict ISO) accepts it downstream. An
// unparseable string is reported as a row error, not silently dropped to null.
const dueAtField = z
  .string()
  .trim()
  .refine((v) => !Number.isNaN(Date.parse(v)), "must be a valid date")
  .transform((v) => new Date(v).toISOString())
  .nullable()
  .default(null);

export const activityImportRowSchema = z.object({
  subject: z.string().min(1).max(255),
  typeKey: z.string().trim().min(1).nullable().default(null),
  dueAt: dueAtField,
  durationMinutes: z.coerce.number().int().positive().nullable().default(null),
  // Without this, z.object strips the customFields key mapRow.ts already validated against the
  // live defs (unknown keys are dropped by default), so commitActivity.ts's second parse through
  // this schema would silently lose every custom-field value before it ever reaches
  // activityCreateInput. Matches the exact shape activityCreateInput/personCreateInput/
  // orgCreateInput declare so the value round-trips unchanged.
  customFields: z.record(z.string(), z.unknown()).default({}),
});
export type ActivityImportRow = z.infer<typeof activityImportRowSchema>;
