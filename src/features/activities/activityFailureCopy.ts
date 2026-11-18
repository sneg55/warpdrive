import type { ActionFailureCopy } from "@/lib/actionFailure";

export const ACTIVITY_CREATE_COPY: ActionFailureCopy = {
  failed: "Could not create activity",
  retry: "add the activity",
  unconfirmed: "the activity was created",
  check: "Check for it before saving again.",
};

export const ACTIVITY_SAVE_COPY: ActionFailureCopy = {
  failed: "Could not save activity",
  retry: "save the activity",
  unconfirmed: "the activity was saved",
  check: "Check it before saving again.",
};
