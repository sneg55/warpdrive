const CTA_BASE =
  "inline-flex touch-manipulation items-center justify-center rounded-md text-sm font-semibold transition-[background-color,opacity,scale] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 active:scale-[0.96]";

export const CTA_PRIMARY = `${CTA_BASE} h-10 bg-action px-5 text-action-foreground hover:opacity-90`;

export const CTA_SECONDARY = `${CTA_BASE} h-10 border bg-card px-5 text-foreground hover:bg-muted`;

export const CTA_PRIMARY_SM = `${CTA_BASE} h-9 border bg-card px-4 text-foreground hover:bg-muted`;
