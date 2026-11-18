export type ComposerContext =
  | { kind: "inbox"; threadId?: string }
  | { kind: "person"; personId: string }
  | {
      kind: "deal";
      dealId: string;
      defaultTo?: string;
      participantEmails?: string[];
      personId?: string;
      orgId?: string;
      dealTitle?: string;
      dealValue?: string;
      personFirstName?: string;
      personLastName?: string;
      personEmail?: string;
      orgName?: string;
    };
