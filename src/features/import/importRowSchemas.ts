import { z } from "zod";
import { SOURCE_CHANNEL_KEYS } from "@/constants/sourceChannels";
import {
  MAX_DOMAIN_LEN,
  MAX_INDUSTRY_LEN,
  MAX_LINKEDIN_URL_LEN,
  personCreateInput,
} from "@/features/contacts/schemas";
import {
  archivedFlag,
  dealStatus,
  doneFlag,
  importDate,
  labelList,
  lostReason,
  optionalImportDate,
  optionalText,
  pipedriveLinkShape,
} from "./importFieldParsers";

const currencyValue = z.coerce.number().nonnegative().nullable().default(null);

const MISSING_NAME_MESSAGE = "name is required without a Pipedrive ID";

function requireNameOrPipedriveId(
  value: { name?: string | undefined; pipedriveId?: string | undefined },
  ctx: z.RefinementCtx,
): void {
  if (value.name === undefined && value.pipedriveId === undefined) {
    ctx.addIssue({ code: "custom", path: ["name"], message: MISSING_NAME_MESSAGE });
  }
}

export const orgImportBaseSchema = z.object({
  name: z.string().trim().min(1).max(255),
  pipedriveId: optionalText,
  owner: optionalText,
  domain: z.string().trim().max(MAX_DOMAIN_LEN).optional(),
  industry: z.string().trim().max(MAX_INDUSTRY_LEN).optional(),
  linkedinUrl: z.string().trim().max(MAX_LINKEDIN_URL_LEN).optional(),
  employeeCount: z.coerce.number().int().nonnegative().optional(),
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

export const orgImportGroupSchema = orgImportBaseSchema
  .partial({ name: true })
  .superRefine(requireNameOrPipedriveId);

export const personImportBaseSchema = personCreateInput
  .pick({
    name: true,
    firstName: true,
    lastName: true,
    emails: true,
    phones: true,
  })
  .extend({ pipedriveId: optionalText, owner: optionalText });

export const personImportGroupSchema = personImportBaseSchema
  .partial({ name: true })
  .superRefine(requireNameOrPipedriveId);

export const noteImportGroupSchema = z.object({ body: z.string().trim().min(1).max(50_000) });

export const dealImportRowSchema = z.object({
  title: z.string().min(1).max(255),
  value: currencyValue,
  expectedCloseDate: z.string().date().nullable().default(null),
  pipeline: z.string().trim().min(1).nullable().default(null),
  stage: z.string().trim().min(1).nullable().default(null),
  pipedriveId: optionalText,
  owner: optionalText,
  status: dealStatus,
  wonTime: optionalImportDate,
  lostTime: optionalImportDate,
  createdAt: optionalImportDate,
  lostReason,
  labels: labelList,
  customFields: z.record(z.string(), z.unknown()).default({}),
});

export const leadImportRowSchema = z.object({
  title: z.string().min(1).max(255),
  value: currencyValue,
  expectedCloseDate: z.string().date().nullable().default(null),
  sourceChannel: z
    .enum(SOURCE_CHANNEL_KEYS as [string, ...string[]])
    .nullable()
    .default(null),
  sourceChannelId: z.string().trim().min(1).max(255).nullable().default(null),
  pipedriveId: optionalText,
  owner: optionalText,
  labels: labelList,
  createdAt: optionalImportDate,
  archived: archivedFlag,
  customFields: z.record(z.string(), z.unknown()).default({}),
});

const dueAtField = importDate.nullable().default(null);

export const activityImportRowSchema = z.object({
  subject: z.string().min(1).max(255),
  typeKey: z.string().trim().min(1).nullable().default(null),
  dueAt: dueAtField,
  durationMinutes: z.coerce.number().int().positive().nullable().default(null),
  pipedriveId: optionalText,
  assignee: optionalText,
  done: doneFlag,
  doneAt: optionalImportDate,
  ...pipedriveLinkShape,
  customFields: z.record(z.string(), z.unknown()).default({}),
});

export const noteImportRowSchema = z.object({
  body: z.string().trim().min(1).max(50_000),
  createdAt: optionalImportDate,
  pipedriveId: optionalText,
  ...pipedriveLinkShape,
});
