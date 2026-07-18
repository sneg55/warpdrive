// Shared CTA link styling so nav, hero, and footer stay in sync. Mirrors the Button
// component's geometry and 0.96 press feedback without forcing a client boundary: the
// landing surfaces are server components and the CTAs are plain links.
export const CTA_PRIMARY =
  "inline-flex h-10 touch-manipulation items-center justify-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition-[opacity,scale] duration-150 ease-out hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-[0.96]";

export const CTA_PRIMARY_SM =
  "inline-flex h-9 touch-manipulation items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-[opacity,scale] duration-150 ease-out hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-[0.96]";
