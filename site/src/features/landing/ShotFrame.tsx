"use client";
import Image, { type StaticImageData } from "next/image";
import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { STRINGS } from "@/constants/strings";

interface ShotFrameProps {
  src: StaticImageData;
  alt: string;
  priority?: boolean;
}

// Framed product screenshot; clicking zooms it into a lightbox (the sanctioned shadcn
// Dialog, so focus trap, Escape, and scroll lock come free). Concentric radius: the 4px
// image corner plus the 6px padding gives the 10px panel corner. The image gets the
// standard 1px .img-outline edge and the panel a layered transparent shadow, so depth
// works on both the muted and plain sections. Explicit width/height keeps the aspect
// ratio even when the bundler passes a plain URL string (Vitest) instead of Next's
// StaticImageData object.
export function ShotFrame({ src, alt, priority = false }: ShotFrameProps): ReactNode {
  return (
    <Dialog>
      <DialogTrigger
        aria-label={`${STRINGS.landing.shot.enlargeLabel}: ${alt}`}
        className="block w-full cursor-zoom-in rounded-lg border bg-card p-1.5 text-left shadow-[0_1px_2px_rgb(15_23_42/0.06),0_24px_60px_-24px_rgb(15_23_42/0.22)] transition-opacity hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <Image
          src={src}
          alt={alt}
          width={1600}
          height={1000}
          priority={priority}
          className="img-outline h-auto w-full rounded-[4px]"
        />
      </DialogTrigger>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-6xl p-2 sm:p-3">
        <DialogTitle className="sr-only">{alt}</DialogTitle>
        <Image
          src={src}
          alt={alt}
          width={1600}
          height={1000}
          className="img-outline h-auto w-full rounded-[4px]"
        />
      </DialogContent>
    </Dialog>
  );
}
