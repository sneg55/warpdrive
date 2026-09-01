// One condition-row validator for every entity that has a filter builder (deals, people, orgs,
// leads). The field metadata is supplied by each feature's zod-free config module, so the client
// dropdowns and this server allow-list stay in lockstep without the client importing zod.
import { z } from "zod";
import { FILTER_OP_KEYS, VALUELESS_OPS } from "@/constants/filterOps";

// Which fields exist, which operators each field's column type can run, and the column classes
// that need an extra value check (numeric cast, date parse, text[] membership).
export interface ConditionFieldConfig {
  fields: readonly string[];
  opsByField: Record<string, readonly string[]>;
  numericFields: readonly string[];
  dateFields?: readonly string[];
  arrayFields?: readonly string[];
}

// A condition value is a single scalar, or a list of names for an array column ("is any of").
export const conditionValue = z.union([z.string(), z.number(), z.array(z.string())]);
export type ConditionValue = z.infer<typeof conditionValue>;

const CONDITION_COMBINATORS = ["and", "or"] as const;
export type ConditionCombinator = (typeof CONDITION_COMBINATORS)[number];

function issue(ctx: z.RefinementCtx, message: string, path: string): void {
  ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: [path] });
}

// An array column compiles to membership over unnest, so its value is one label name or a list of
// them. A blank name would build a membership test that can never match and reads as a no-op.
function refineArrayValue(field: string, value: ConditionValue, ctx: z.RefinementCtx): void {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      issue(ctx, `field "${field}" needs at least one value`, "value");
      return;
    }
    if (value.some((v) => v.trim() === "")) {
      issue(ctx, `field "${field}" needs non-empty values`, "value");
    }
    return;
  }
  if (typeof value !== "string" || value.trim() === "") {
    issue(ctx, `field "${field}" needs a non-empty value`, "value");
  }
}

// Shared refinement body: op/field pairing first, then the per-column-class value checks. Exported
// so an entity schema with its own field enum (deals) can reuse the exact same rules.
export function refineCondition(
  c: { field: string; op: string; value?: ConditionValue },
  ctx: z.RefinementCtx,
  config: ConditionFieldConfig,
): void {
  if (!(config.opsByField[c.field] ?? []).includes(c.op)) {
    issue(ctx, `operator "${c.op}" is not valid for field "${c.field}"`, "op");
  }
  // A valueless op compiles to a NULL/empty test, so every value check below would reject a
  // complete row.
  if (VALUELESS_OPS.has(c.op)) return;
  if (c.value === undefined) {
    issue(ctx, `operator "${c.op}" needs a value`, "value");
    return;
  }
  if (config.arrayFields?.includes(c.field) === true) {
    if (Array.isArray(c.value) && c.op !== "eq" && c.op !== "neq") {
      issue(ctx, `operator "${c.op}" does not take a list of values`, "value");
      return;
    }
    refineArrayValue(c.field, c.value, ctx);
    return;
  }
  if (Array.isArray(c.value)) {
    issue(ctx, `field "${c.field}" takes a single value`, "value");
    return;
  }
  // Numeric and date columns need a value that parses, or the comparison fails the SQL cast.
  if (config.numericFields.includes(c.field) && !Number.isFinite(Number(c.value))) {
    issue(ctx, `field "${c.field}" needs a numeric value`, "value");
  }
  if (config.dateFields?.includes(c.field) === true && Number.isNaN(Date.parse(String(c.value)))) {
    issue(ctx, `field "${c.field}" needs a date value`, "value");
  }
}

function buildConditionSchema(config: ConditionFieldConfig) {
  return z
    .object({
      field: z.enum(config.fields as unknown as [string, ...string[]]),
      op: z.enum(FILTER_OP_KEYS),
      // Optional because isEmpty/isNotEmpty compare against no value.
      value: conditionValue.optional(),
    })
    .superRefine((c, ctx) => {
      refineCondition(c, ctx, config);
    });
}

// Full ad-hoc filter shape: how the rows fold, plus the rows. The combinator defaults to "and" so
// a definition stored before the key existed keeps meaning what it meant when it was written.
export function buildFilterSchema(config: ConditionFieldConfig) {
  return z.object({
    combinator: z.enum(CONDITION_COMBINATORS).default("and"),
    conditions: z.array(buildConditionSchema(config)).max(20),
  });
}
