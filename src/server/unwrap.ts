import { TRPCError } from "@trpc/server";
import { type AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Result } from "@/types/result";

// 404: record missing or invisible to the actor (404-on-invisible never leaks existence).
const NOT_FOUND_IDS = new Set<string>([
  ERROR_IDS.CONTACT_NOT_FOUND,
  ERROR_IDS.DEAL_NOT_FOUND,
  ERROR_IDS.PIPELINE_NOT_FOUND,
  ERROR_IDS.NOTE_NOT_FOUND,
  ERROR_IDS.ACTIVITY_NOT_FOUND,
  ERROR_IDS.USER_NOT_FOUND,
  ERROR_IDS.CF_DEF_NOT_FOUND,
  ERROR_IDS.IMPORT_BATCH_NOT_FOUND,
  ERROR_IDS.GMAIL_THREAD_NOT_FOUND,
]);

// 403: record is visible but the actor lacks permission for the action.
const FORBIDDEN_IDS = new Set<string>([
  ERROR_IDS.PERM_DENIED,
  ERROR_IDS.PERM_SELF_ESCALATION,
  ERROR_IDS.PERM_GROUP_REQUIRED,
  ERROR_IDS.ACTIVITY_FORBIDDEN,
  ERROR_IDS.CONTACT_MERGE_FORBIDDEN,
]);

// 400: caller-fixable validation or precondition failure (bad input, not a server fault).
const BAD_REQUEST_IDS = new Set<string>([
  ERROR_IDS.DEAL_PRECONDITION,
  ERROR_IDS.DEAL_STAGE_MISMATCH,
  ERROR_IDS.DEAL_LOST_REASON_REQUIRED,
  ERROR_IDS.DEAL_LOST_REASON_INVALID,
  ERROR_IDS.CF_VALUE_INVALID,
  ERROR_IDS.CONTACT_ADDRESS_INVALID,
  ERROR_IDS.CONTACT_MERGE_SAME,
  ERROR_IDS.IMPORT_ROW_GONE,
  ERROR_IDS.IMPORT_MAPPING_MISSING,
  ERROR_IDS.GMAIL_SEND_INPUT_INVALID,
  ERROR_IDS.GMAIL_AUTHORING_INPUT_INVALID,
  ERROR_IDS.FILE_PRESIGN_INVALID,
  ERROR_IDS.FILE_METADATA_MISMATCH,
]);

// Convert a repo Result into a value or a TRPCError. Sets are checked in order so a
// new error id has an obvious home; anything unmapped (E_DB_*, unknown) is a real
// server fault and surfaces as INTERNAL_SERVER_ERROR. The message stays the stable id.
export async function unwrap<T>(result: Promise<Result<T, AppError>>): Promise<T> {
  const r = await result;
  if (r.ok) return r.value;
  const id = r.error.id;
  if (NOT_FOUND_IDS.has(id)) {
    throw new TRPCError({ code: "NOT_FOUND", message: id });
  }
  if (FORBIDDEN_IDS.has(id)) {
    throw new TRPCError({ code: "FORBIDDEN", message: id });
  }
  if (BAD_REQUEST_IDS.has(id)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: id });
  }
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: id });
}
