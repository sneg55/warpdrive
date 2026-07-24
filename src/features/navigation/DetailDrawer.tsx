"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useRecordPreview } from "./recordPreviewStore";

// Wraps intercepted detail content (person/org/lead) in a right-anchored Sheet so it renders as a
// Pipedrive-style slide-over over the list route, while the list stays mounted behind the scrim.
// Closing (scrim click / Escape / the X) calls router.back(), which pops the intercepted route and
// returns to the list with scroll + selection intact. Hard navigation / refresh / deep links bypass
// the interception and render the standalone detail page instead.
// Default width: content-rich slide-over that scales with the viewport. Person/org detail render at
// ~66vw (Pipedrive opens those as a ~66% content column). The lead drawer overrides this with a
// wider class (PD's lead drawer measures ~75vw at a 1440px viewport, its two-column overview needs
// the room). Both cap at 1280px so they stay sane on ultrawide.
const DEFAULT_CONTENT_CLASS =
  "w-full sm:w-[94vw] md:w-[82vw] lg:w-[72vw] xl:w-[66vw] max-w-[1280px]";

export function DetailDrawer({
  title,
  children,
  contentClassName = DEFAULT_CONTENT_CLASS,
}: {
  title: string;
  children: React.ReactNode;
  // Per-surface width override. Defaults to the person/org ~66vw footprint; the lead drawer passes
  // a wider class to match Pipedrive's lead slide-over.
  contentClassName?: string;
}): React.ReactNode {
  const router = useRouter();
  const clearPreview = useRecordPreview((s) => s.clearPreview);
  const [open, setOpen] = useState(true);

  function onOpenChange(next: boolean): void {
    if (!next) {
      setOpen(false);
      // Drop the preview as the drawer closes so a later open that does not set one (deep link,
      // back/forward) shows the plain skeleton rather than a stale name. The id guard in the
      // skeleton already prevents a wrong-record flash; this keeps the store tidy.
      clearPreview();
      router.back();
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* Record detail is a content-rich slide-over, so it wants to be wide (the generic Sheet caps
          at max-w-3xl / 768px, which reads narrow on large monitors). Width comes from
          contentClassName (see DEFAULT_CONTENT_CLASS): vw units keep the list visible behind the
          scrim, and the lead drawer opts into a wider footprint. */}
      <SheetContent aria-describedby={undefined} className={contentClassName}>
        {/* Visually-hidden title: Radix Dialog requires a title for the a11y contract; the real
            heading is inside the detail content. */}
        <SheetTitle className="sr-only">{title}</SheetTitle>
        <div className="p-6">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
