import { z } from "zod";
import { labelNameArray } from "@/features/labels/labelsSchema";
// Field length bounds live in a zod-free module so client forms can read a maxLength hint without
// pulling zod; re-exported here so existing importers of contacts/schemas.ts still resolve.
import {
  MAX_DOMAIN_LEN,
  MAX_EMAIL_LEN,
  MAX_INDUSTRY_LEN,
  MAX_LINKEDIN_URL_LEN,
  MAX_PHONE_LEN,
} from "./fieldBounds";

export { MAX_DOMAIN_LEN, MAX_EMAIL_LEN, MAX_INDUSTRY_LEN, MAX_LINKEDIN_URL_LEN, MAX_PHONE_LEN };

// Person/org labels reuse the shared catalog-label schema (validated by name against the
// user-managed catalog in the UI), mirroring deals + leads. Deduped + capped by labelNameArray.
// Omitted on update means "leave labels untouched".
const contactLabelsArray = labelNameArray;

// annualRevenue is stored as numeric(14,2); validated as a plain non-negative decimal string
// (no commas/currency symbols) so a malformed value fails Zod instead of Postgres's numeric cast.
const ANNUAL_REVENUE_PATTERN = /^\d+(\.\d{1,2})?$/;
// Permissive phone charset: digits plus the common grouping characters (including "." which
// real dialers and CSV exports use). The leading lookahead requires at least one digit, so a
// value like "call me" (letters) or "()" (punctuation only) cannot slip through as a phone.
const PHONE_PATTERN = /^(?=.*[0-9])[0-9+().\-\s]+$/;

export const contactPointSchema = z.object({
  label: z.string().max(40),
  value: z.string().min(1),
  primary: z.boolean().default(false),
});

// Contact points are stored per kind (emails[] vs phones[]) rather than carrying a type tag,
// so each kind gets its own value validator layered on the shared base.
export const emailPointSchema = contactPointSchema.extend({
  value: z.string().trim().min(1).max(MAX_EMAIL_LEN).email(),
});
export const phonePointSchema = contactPointSchema.extend({
  value: z.string().trim().min(1).max(MAX_PHONE_LEN).regex(PHONE_PATTERN),
});

const addressObject = z.object({
  street: z.string().optional(),
  city: z.string().optional(),
  region: z.string().optional(),
  postal: z.string().optional(),
  country: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

export const addressInputSchema = addressObject.nullable().default(null);

// CLIENT input: ownerId/visibility derived server-side, never accepted here.
export const personCreateInput = z.object({
  name: z.string().min(1).max(255),
  firstName: z.string().trim().max(255).nullish(),
  lastName: z.string().trim().max(255).nullish(),
  emails: z.array(emailPointSchema).default([]),
  phones: z.array(phonePointSchema).default([]),
  orgId: z.string().uuid().nullable().default(null),
  customFields: z.record(z.string(), z.unknown()).default({}),
});
export type PersonCreateInput = z.infer<typeof personCreateInput>;

export const personUpdateInput = personCreateInput.partial().extend({
  id: z.string().uuid(),
  // Strip the create-time .default()s on update: .partial() alone keeps them, so an omitted
  // field would parse to [] / null / {} and updatePerson's `input.x ?? current.x` coalesce would
  // WIPE the current value on a single-field or owner-only edit. Plain .optional() -> undefined.
  emails: z.array(emailPointSchema).optional(),
  phones: z.array(phonePointSchema).optional(),
  orgId: z.string().uuid().nullable().optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
  // Owner transfer (CO-3): only applied by updatePerson when the actor holds deal.changeOwner
  // (or is admin); ignored otherwise, so injecting ownerId into a plain inline edit cannot
  // reassign the record (mirrors resolveOwnerId's create-time gate).
  ownerId: z.string().uuid().optional(),
  // Add-labels (spec B5): omitted leaves labels untouched.
  labels: contactLabelsArray.optional(),
});
export type PersonUpdateInput = z.infer<typeof personUpdateInput>;

export const personDeleteInput = z.object({ id: z.string().uuid() });
export type PersonDeleteInput = z.infer<typeof personDeleteInput>;

// Server-driven ORDER BY for the People list (contacts.listPeople).
export const PERSON_SORT_FIELDS = ["name", "primaryEmail"] as const;
export type PersonSortField = (typeof PERSON_SORT_FIELDS)[number];
export const personSortInput = z.object({
  field: z.enum(PERSON_SORT_FIELDS),
  dir: z.enum(["asc", "desc"]),
});
export type PersonSort = z.infer<typeof personSortInput>;

// Server-driven ORDER BY for the Organizations list (contacts.listOrgs).
export const ORG_SORT_FIELDS = ["name"] as const;
export type OrgSortField = (typeof ORG_SORT_FIELDS)[number];
export const orgSortInput = z.object({
  field: z.enum(ORG_SORT_FIELDS),
  dir: z.enum(["asc", "desc"]),
});
export type OrgSort = z.infer<typeof orgSortInput>;

export const orgCreateInput = z.object({
  name: z.string().min(1).max(255),
  address: addressInputSchema,
  customFields: z.record(z.string(), z.unknown()).default({}),
});
export type OrgCreateInput = z.infer<typeof orgCreateInput>;

export const orgUpdateInput = orgCreateInput.partial().extend({
  id: z.string().uuid(),
  // Strip create-time .default()s on update (see personUpdateInput): omitted -> undefined so the
  // updateOrg coalesce falls through to the current value instead of resetting it.
  address: addressObject.nullable().optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
  // Owner transfer (CO-3): gated the same way as personUpdateInput.ownerId (deal.changeOwner/admin).
  ownerId: z.string().uuid().optional(),
  domain: z.string().max(MAX_DOMAIN_LEN).nullable().optional(),
  industry: z.string().max(MAX_INDUSTRY_LEN).nullable().optional(),
  linkedinUrl: z.string().max(MAX_LINKEDIN_URL_LEN).nullable().optional(),
  employeeCount: z.number().int().nonnegative().nullable().optional(),
  annualRevenue: z.string().regex(ANNUAL_REVENUE_PATTERN).nullable().optional(),
  // Add-labels (spec B5): omitted leaves labels untouched.
  labels: contactLabelsArray.optional(),
});
export type OrgUpdateInput = z.infer<typeof orgUpdateInput>;

export const orgDeleteInput = z.object({ id: z.string().uuid() });
export type OrgDeleteInput = z.infer<typeof orgDeleteInput>;

// Related organizations (Wave 3, Task 23). relationType is a free-text label from the
// creator's perspective (e.g. "parent", "subsidiary", "partner"), not a closed enum.
export const MAX_RELATION_TYPE_LEN = 100;

export const addOrgRelationInput = z.object({
  sourceOrgId: z.string().uuid(),
  targetOrgId: z.string().uuid(),
  relationType: z.string().trim().min(1).max(MAX_RELATION_TYPE_LEN),
});
export type AddOrgRelationInput = z.infer<typeof addOrgRelationInput>;

export const removeOrgRelationInput = z.object({
  sourceOrgId: z.string().uuid(),
  targetOrgId: z.string().uuid(),
});
export type RemoveOrgRelationInput = z.infer<typeof removeOrgRelationInput>;

// Contact followers (Wave 3, Task 24). entityType is closed to person|organization since a
// follower always anchors to one of those two contact record kinds.
export const contactFollowInput = z.object({
  entityType: z.enum(["person", "organization"]),
  entityId: z.string().uuid(),
});
export type ContactFollowInput = z.infer<typeof contactFollowInput>;
