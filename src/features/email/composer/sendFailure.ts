import { ERROR_IDS } from "@/constants/errorIds";
import { STRINGS } from "@/constants/strings";
import { COMPOSER_STRINGS } from "./composer.constants";

const MESSAGES: Record<string, string> = {
  [ERROR_IDS.UI_STALE_BUILD]:
    "Warpdrive was updated while this page was open. Reload the page, then send again.",
  [ERROR_IDS.UI_ACTION_UNCONFIRMED]: COMPOSER_STRINGS.sendUnconfirmed,
  [ERROR_IDS.PERM_DENIED]: "Your session is no longer valid. Reload the page and sign in again.",
  [ERROR_IDS.GMAIL_GRANT_REVOKED]:
    "Google has disconnected this mailbox. Reconnect it in Settings, then send again.",
  [ERROR_IDS.GMAIL_TOKEN_DECRYPT_FAILED]:
    "This mailbox's stored credentials could not be read. An admin needs to reconnect it.",
  [ERROR_IDS.GMAIL_ATTACHMENT_DENIED]:
    "An attachment could not be read. Remove it and attach the file again.",
  [ERROR_IDS.GMAIL_SEND_INPUT_INVALID]:
    "Something in this message was rejected before sending. Check the recipients and subject.",
  [ERROR_IDS.GMAIL_API_EXHAUSTED]: STRINGS.inbox.errorSend,
};

export function sendFailureMessage(errorId: string): string {
  return MESSAGES[errorId] ?? STRINGS.inbox.errorSend;
}
