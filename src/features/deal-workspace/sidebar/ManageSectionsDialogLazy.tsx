"use client";

// ManageSectionsDialog is the last thing pulling dnd-kit into the /deals/[dealId] bundle, and it
// is a dialog most users never open. DealSidebar rendered it unconditionally with open={false},
// so a static import put dnd-kit in the route chunk to draw nothing.
//
// This wrapper keeps the module out of the route chunk: nothing is rendered (and nothing is
// fetched) until the dialog is first opened. Once opened it stays mounted, so Radix still runs its
// close transition rather than the dialog vanishing.
import dynamic from "next/dynamic";
import type React from "react";
import { useState } from "react";
import type { ManageSectionsDialogProps } from "./ManageSectionsDialog";

const Impl = dynamic(async () => (await import("./ManageSectionsDialog")).ManageSectionsDialog, {
  ssr: false,
});

export function ManageSectionsDialog(props: ManageSectionsDialogProps): React.ReactNode {
  const [everOpened, setEverOpened] = useState(props.open);
  // Derived during render rather than in an effect: an effect would add a wasted render and trip
  // react-hooks/set-state-in-effect.
  if (props.open && !everOpened) setEverOpened(true);

  if (!everOpened) return null;
  return <Impl {...props} />;
}
