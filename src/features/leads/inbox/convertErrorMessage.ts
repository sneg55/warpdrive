import { ERROR_IDS } from "@/constants/errorIds";

const MESSAGES: Record<string, string> = {
  [ERROR_IDS.PERM_DENIED]: "You do not have permission to create deals.",
  [ERROR_IDS.LEAD_ALREADY_CONVERTED]: "This lead was already converted.",
  [ERROR_IDS.LEAD_NOT_FOUND]: "This lead changed since it loaded. Refreshing.",
  [ERROR_IDS.LEAD_CONVERT_NO_PIPELINE]: "No target pipeline is configured for convert.",
};

export function convertErrorMessage(id: string): string {
  return MESSAGES[id] ?? "Could not convert this lead.";
}
