import { z } from "zod";
import type { CustomFieldSortKey } from "@/features/custom-fields/sortKey";
import { customFieldSortKeySchema } from "@/features/custom-fields/sortKeySchema";
import { labelNameArray } from "@/features/labels/labelsSchema";
import {
  MAX_DOMAIN_LEN,
  MAX_EMAIL_LEN,
  MAX_INDUSTRY_LEN,
  MAX_LINKEDIN_URL_LEN,
  MAX_PHONE_LEN,
} from "./fieldBounds";

export { MAX_DOMAIN_LEN, MAX_EMAIL_LEN, MAX_INDUSTRY_LEN, MAX_LINKEDIN_URL_LEN };

const contactLabelsArray = labelNameArray;

const ANNUAL_REVENUE_PATTERN = /^\d+(\.\d{1,2})?$/;
const PHONE_PATTERN = /^(?=.*[0-9])[0-9+().\-\s]+$/;

export const contactPointSchema = z.object({
  label: z.string().max(40),
  value: z.string().min(1),
  primary: z.boolean().default(false),
});

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

const addressInputSchema = addressObject.nullable().default(null);

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
  emails: z.array(emailPointSchema).optional(),
  phones: z.array(phonePointSchema).optional(),
  orgId: z.string().uuid().nullable().optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
  ownerId: z.string().uuid().optional(),
  labels: contactLabelsArray.optional(),
});
export type PersonUpdateInput = z.infer<typeof personUpdateInput>;

export const personDeleteInput = z.object({ id: z.string().uuid() });

const PERSON_SORT_FIELDS = ["name", "primaryEmail"] as const;
export type PersonBuiltinSortField = (typeof PERSON_SORT_FIELDS)[number];
export type PersonSortField = PersonBuiltinSortField | CustomFieldSortKey;
export const personSortInput = z.object({
  field: z.union([z.enum(PERSON_SORT_FIELDS), customFieldSortKeySchema]),
  dir: z.enum(["asc", "desc"]),
});

const ORG_SORT_FIELDS = ["name"] as const;
export type OrgBuiltinSortField = (typeof ORG_SORT_FIELDS)[number];
export type OrgSortField = OrgBuiltinSortField | CustomFieldSortKey;
export const orgSortInput = z.object({
  field: z.union([z.enum(ORG_SORT_FIELDS), customFieldSortKeySchema]),
  dir: z.enum(["asc", "desc"]),
});

export const orgCreateInput = z.object({
  name: z.string().min(1).max(255),
  address: addressInputSchema,
  customFields: z.record(z.string(), z.unknown()).default({}),
});
export type OrgCreateInput = z.infer<typeof orgCreateInput>;

export const orgUpdateInput = orgCreateInput.partial().extend({
  id: z.string().uuid(),
  address: addressObject.nullable().optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
  ownerId: z.string().uuid().optional(),
  domain: z.string().max(MAX_DOMAIN_LEN).nullable().optional(),
  industry: z.string().max(MAX_INDUSTRY_LEN).nullable().optional(),
  linkedinUrl: z.string().max(MAX_LINKEDIN_URL_LEN).nullable().optional(),
  employeeCount: z.number().int().nonnegative().nullable().optional(),
  annualRevenue: z.string().regex(ANNUAL_REVENUE_PATTERN).nullable().optional(),
  labels: contactLabelsArray.optional(),
});
export type OrgUpdateInput = z.infer<typeof orgUpdateInput>;

export const orgDeleteInput = z.object({ id: z.string().uuid() });

const MAX_RELATION_TYPE_LEN = 100;

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

export const contactFollowInput = z.object({
  entityType: z.enum(["person", "organization"]),
  entityId: z.string().uuid(),
});
export type ContactFollowInput = z.infer<typeof contactFollowInput>;
