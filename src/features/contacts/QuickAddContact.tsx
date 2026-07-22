"use client";

import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { STRINGS } from "@/constants/strings";
import {
  OrganizationCreateModal,
  PersonCreateModal,
} from "@/features/quick-add/GlobalContactModal";

const S = STRINGS.contacts;

interface QuickAddContactProps {
  kind: "person" | "org";
  // Optional overrides used by the inbox sidebar's create-and-auto-link flow: relabel the trigger,
  // seed the name/email from the thread's sender, and hand back the new id so the caller can link.
  triggerLabel?: string;
  prefillName?: string;
  prefillEmail?: string;
  onCreated?: (id: string) => void;
}

// Contact-list and embedded quick-add triggers now open the same rich entity-create variants used
// by the global "+" menu. There is no separate name-only dialog to drift from the Add lead shell.
export function QuickAddContact({
  kind,
  triggerLabel,
  prefillName,
  prefillEmail,
  onCreated,
}: QuickAddContactProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const label = triggerLabel ?? (kind === "person" ? S.addPerson : S.addOrg);
  const modalProps = {
    initialName: prefillName,
    initialEmail: prefillEmail,
    afterCreate:
      onCreated === undefined ? ("respect-interface-preference" as const) : ("stay" as const),
    onClose: () => setOpen(false),
    onCreated: (id: string) => onCreated?.(id),
  };

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        {label}
      </Button>

      {open &&
        (kind === "person" ? (
          <PersonCreateModal {...modalProps} />
        ) : (
          <OrganizationCreateModal {...modalProps} />
        ))}
    </>
  );
}
