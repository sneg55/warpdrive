"use client";
import Image from "next/image";
import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { STRINGS } from "@/constants/strings";
import type { Screenshot } from "./screenshots";

interface ShotFrameProps {
  shot: Screenshot;
  alt: string;
  priority?: boolean;
}

const INLINE_SIZE = { width: 1600, height: 1000 } as const;
const ZOOM_SIZE = { width: 3200, height: 2000 } as const;

export function ShotFrame({ shot, alt, priority = false }: ShotFrameProps): ReactNode {
  return (
    <Dialog>
      <DialogTrigger
        aria-label={`${STRINGS.landing.shot.enlargeLabel}: ${alt}`}
        className="block w-full cursor-zoom-in rounded-lg border bg-card p-1.5 text-left shadow-[0_1px_2px_rgb(15_23_42/0.06),0_24px_60px_-24px_rgb(15_23_42/0.22)] transition-opacity hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <Image
          src={shot.inline}
          alt={alt}
          {...INLINE_SIZE}
          priority={priority}
          className="img-outline h-auto w-full rounded-[4px]"
        />
      </DialogTrigger>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-6xl p-2 sm:p-3">
        <DialogTitle className="sr-only">{alt}</DialogTitle>
        <Image src={shot.zoom} alt={alt} {...ZOOM_SIZE} className="img-outline h-auto w-full rounded-[4px]" />
      </DialogContent>
    </Dialog>
  );
}
