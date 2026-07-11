"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

// Wraps intercepted detail content (person/org/lead) in a right-anchored Sheet so it renders as a
// Pipedrive-style slide-over over the list route, while the list stays mounted behind the scrim.
// Closing (scrim click / Escape / the X) calls router.back(), which pops the intercepted route and
// returns to the list with scroll + selection intact. Hard navigation / refresh / deep links bypass
// the interception and render the standalone detail page instead.
export function DetailDrawer({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactNode {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  function onOpenChange(next: boolean): void {
    if (!next) {
      setOpen(false);
      router.back();
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* Record detail is a content-rich slide-over, so it wants to be wide. The generic Sheet caps
          at max-w-3xl (768px), which reads narrow on large monitors. Pipedrive opens person/org
          detail as a full-page view whose content column measures ~66% of the viewport (~944px on a
          1440px screen); match that proportion here so the drawer no longer reads as narrow, while
          the vw units keep the list visible behind the scrim. Cap it so it stays sane on ultrawide. */}
      <SheetContent
        aria-describedby={undefined}
        className="w-full sm:w-[94vw] md:w-[82vw] lg:w-[72vw] xl:w-[66vw] max-w-[1280px]"
      >
        {/* Visually-hidden title: Radix Dialog requires a title for the a11y contract; the real
            heading is inside the detail content. */}
        <SheetTitle className="sr-only">{title}</SheetTitle>
        <div className="p-6">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
