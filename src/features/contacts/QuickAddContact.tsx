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
  triggerLabel?: string;
  prefillName?: string;
  prefillEmail?: string;
  onCreated?: (id: string) => void;
}

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
