"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { useCallback, useState } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { DetailDrawerCloseContext } from "./detailDrawerClose";
import { useRecordPreview } from "./recordPreviewStore";

const DEFAULT_CONTENT_CLASS =
  "w-full sm:w-[94vw] md:w-[82vw] lg:w-[72vw] xl:w-[66vw] max-w-[1280px]";

export function DetailDrawer({
  title,
  children,
  contentClassName = DEFAULT_CONTENT_CLASS,
}: {
  title: string;
  children: React.ReactNode;
  contentClassName?: string;
}): React.ReactNode {
  const router = useRouter();
  const clearPreview = useRecordPreview((s) => s.clearPreview);
  const [open, setOpen] = useState(true);

  const closeDrawer = useCallback(() => {
    setOpen(false);
    clearPreview();
    router.back();
  }, [clearPreview, router]);

  function onOpenChange(next: boolean): void {
    if (!next) closeDrawer();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent aria-describedby={undefined} className={contentClassName}>
        <SheetTitle className="sr-only">{title}</SheetTitle>
        <DetailDrawerCloseContext.Provider value={closeDrawer}>
          <div className="p-6">{children}</div>
        </DetailDrawerCloseContext.Provider>
      </SheetContent>
    </Sheet>
  );
}
