import { type ActionFailure, actionFailureMessage, settleAction } from "@/lib/actionFailure";

export type CreatedEntityLabel = "deal" | "lead" | "organization" | "person";

export type CreateFailure = ActionFailure;

export const settleCreate = settleAction;

export function createFailureMessage(entity: CreatedEntityLabel, errorId: string): string {
  return actionFailureMessage(
    {
      failed: `Could not create ${entity}`,
      retry: `add the ${entity}`,
      unconfirmed: `the ${entity} was created`,
      check: "Check for it before saving again.",
    },
    errorId,
  );
}
