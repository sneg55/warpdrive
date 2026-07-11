// Types shared across the composer component tree.

export type ComposerContext =
  | { kind: "inbox"; threadId?: string }
  | {
      kind: "deal";
      dealId: string;
      defaultTo?: string;
      // Every participant's email, used when the "prefill all participants" preference is on.
      participantEmails?: string[];
      personId?: string;
      orgId?: string;
      // Resolved display values for the "Insert field" menu (see insertFields()).
      // Optional so senders that lack them still compose; insertFields drops any
      // that are undefined, so the menu only offers fields that have a value.
      dealTitle?: string;
      dealValue?: string;
      personFirstName?: string;
      personLastName?: string;
      personEmail?: string;
      orgName?: string;
    };
