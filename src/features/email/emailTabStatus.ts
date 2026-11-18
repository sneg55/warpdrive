import { STRINGS } from "@/constants/strings";

export function emailTabStatusLabel(query: {
  isLoading: boolean;
  isError: boolean;
}): string | undefined {
  if (query.isError) return STRINGS.inbox.emailListFailed;
  if (query.isLoading) return STRINGS.inbox.loadingEmails;
  return undefined;
}
