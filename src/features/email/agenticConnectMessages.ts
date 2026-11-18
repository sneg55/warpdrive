const MESSAGES: Record<string, string> = {
  E_AINBOX_001: "The agentic inbox rejected the client id or secret.",
  E_AINBOX_002: "That server is not the Warpdrive fork of agentic inbox.",
  E_AINBOX_003: "The agentic inbox has no mailbox with that address.",
  E_AINBOX_008: "The agentic inbox sent a response Warpdrive could not read.",
  E_AINBOX_009: "Could not reach the agentic inbox. Check the base URL.",
  E_GMAIL_027: "That address is already connected as another mailbox.",
  E_GMAIL_028: "Check the fields: the base URL must be https and the address a valid email.",
  E_PERM_001: "Connecting an agentic inbox is not enabled.",
  E_PERM_006: "Only administrators can manage team mailboxes.",
};

export function agenticConnectMessage(errorId: string): string {
  return MESSAGES[errorId] ?? `Connecting failed (${errorId}).`;
}

const MAILBOX_MESSAGES: Record<string, string> = {
  E_AINBOX_001:
    "This mailbox's access token was rejected by the agentic inbox. Reconnect it with new credentials.",
};

export function agenticMailboxErrorMessage(errorId: string): string {
  return (
    MAILBOX_MESSAGES[errorId] ?? MESSAGES[errorId] ?? `This mailbox reported an error (${errorId}).`
  );
}
