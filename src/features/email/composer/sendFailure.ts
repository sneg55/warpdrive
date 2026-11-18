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
  [ERROR_IDS.AINBOX_TOO_MANY_RECIPIENTS]: COMPOSER_STRINGS.tooManyAgenticRecipients,
  [ERROR_IDS.AINBOX_SEND_REJECTED]:
    "The mail server refused this message. Check the recipients, then send again.",
  [ERROR_IDS.GMAIL_SEND_REJECTED]:
    "Gmail refused this message. Check the recipients and attachments, then send again.",
  [ERROR_IDS.GMAIL_SEND_MAY_HAVE_SENT]:
    "This email may have been sent. Check Sent before trying again.",
  [ERROR_IDS.AINBOX_AUTH_FAILED]:
    "This mailbox's access token was rejected. An admin needs to reconnect it in Settings.",
};

export function sendFailureMessage(errorId: string): string {
  return MESSAGES[errorId] ?? STRINGS.inbox.errorSend;
}
