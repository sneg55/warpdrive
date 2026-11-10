"use client";
import { type ComponentProps, useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Composer as ComposerBody } from "./composer/Composer";
import { FromPicker } from "./composer/FromPicker";

export function Composer(props: ComponentProps<typeof ComposerBody>): React.ReactNode {
  const choices = trpc.email.mailboxes.useQuery().data ?? [];
  const mailboxes = choices.filter((mailbox) => mailbox.status === "connected");
  const initialAccountId = props.draft?.accountId ?? props.accountId;
  const [accountId, setAccountId] = useState(initialAccountId);
  const selected = mailboxes.find((mailbox) => mailbox.id === accountId);
  const changed = accountId !== initialAccountId;
  const address = selected?.emailAddress ?? props.fromAddress ?? "";
  return (
    <ComposerBody
      {...props}
      accountId={accountId}
      fromAddress={address}
      threadId={changed ? undefined : props.threadId}
      context={changed && props.context?.kind === "inbox" ? { kind: "inbox" } : props.context}
      draft={
        changed && props.draft !== undefined ? { ...props.draft, threadId: null } : props.draft
      }
      senderPicker={
        <FromPicker
          address={address}
          accountId={accountId}
          mailboxes={mailboxes}
          onChange={setAccountId}
        />
      }
    />
  );
}
