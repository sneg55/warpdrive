"use client";

import dynamic from "next/dynamic";
import type React from "react";
import { useState } from "react";
import type { ManageSectionsDialogProps } from "./ManageSectionsDialog";

const Impl = dynamic(async () => (await import("./ManageSectionsDialog")).ManageSectionsDialog, {
  ssr: false,
});

export function ManageSectionsDialog(props: ManageSectionsDialogProps): React.ReactNode {
  const [everOpened, setEverOpened] = useState(props.open);
  if (props.open && !everOpened) setEverOpened(true);

  if (!everOpened) return null;
  return <Impl {...props} />;
}
