import type { AppError } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import {
  validateCustomFieldsForCreate,
  validateCustomFieldsPartial,
} from "@/features/custom-fields/validateForTarget";
import type { DbOrTx } from "@/server/realtime/channelVersions";
import type { Result } from "@/types/result";

export function validateDealCustomFieldsForCreate(
  db: DbOrTx,
  values: Record<string, unknown>,
  signal: AbortSignal,
): Promise<Result<Record<string, unknown>, AppError>> {
  return validateCustomFieldsForCreate(db, "deal", values, signal);
}

export function validateDealCustomFieldsPartial(
  db: Db,
  values: Record<string, unknown>,
  signal: AbortSignal,
): Promise<Result<Record<string, unknown>, AppError>> {
  return validateCustomFieldsPartial(db, "deal", values, signal);
}
