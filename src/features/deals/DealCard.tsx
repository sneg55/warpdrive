import type React from "react";
import { avatarColorClass, initials } from "@/lib/avatar";
import { formatCurrency } from "@/lib/formatCurrency";
import { cn } from "@/lib/utils";
import type { ActivityState } from "./cardIndicators";
import { activityState, rottingState } from "./cardIndicators";
import type { BoardCard } from "./dealRepo";

// String constants: no magic strings, no em dashes.
const STRINGS = {
  roledescription: "draggable deal card",
  contactSeparator: ", ",
  activityLabel: {
    upcoming: "next activity scheduled",
    today: "activity due today",
    overdue: "activity overdue",
    none: "no activity planned",
  } satisfies Record<ActivityState, string>,
  // Next-action affordance: a small colored circle. Color carries urgency:
  // green = an activity is due today (act now), amber = scheduled for a later day, red = overdue,
  // yellow = nothing scheduled (a warning nudge to book the next step). Green is reserved for
  // "due today" so a glance distinguishes it.
  activityCircle: {
    upcoming: "bg-amber-500 text-white",
    today: "bg-emerald-500 text-white",
    overdue: "bg-red-500 text-white",
    none: "bg-yellow-400 text-white",
  } satisfies Record<ActivityState, string>,
  // Glyph inside the circle: a chevron for the scheduled/overdue states (a forward next-step cue),
  // a warning "!" when nothing is planned so the empty state reads as an alert, not an action.
  activityGlyph: {
    upcoming: "›",
    today: "›",
    overdue: "›",
    none: "!",
  } satisfies Record<ActivityState, string>,
} as const;

// Graded rot background: a healthy card (level 0) keeps bg-card; past the stage's rotting
// threshold the card reddens in steps, capped at the strongest tint. Red is reserved for this
// alert (brand accent stays elsewhere). Index by rot level (1..3).
const ROT_TINT: Record<number, string> = {
  1: "bg-red-50 border-l-4 border-l-red-400",
  2: "bg-red-100 border-l-4 border-l-red-500",
  3: "bg-red-200 border-l-4 border-l-red-600",
} as const;

interface DealCardProps {
  card: BoardCard;
  ownerName: string;
  // The owner's uploaded photo; when present the footer avatar shows it instead of initials.
  ownerAvatarUrl?: string | null;
  personName: string | null;
  orgName: string | null;
  labels: Array<{ name: string; color: string }>;
  rottingDays: number | null;
  density: "comfortable" | "compact";
  // null until the client clock is established (post-mount). Time-derived visuals (rot tint,
  // activity color) render as a neutral baseline while null so SSR and hydration markup agree.
  now: Date | null;
  // Invoked on a plain click (not a drag). Opens the deal, matching Pipedrive where clicking
  // a pipeline card opens the deal. Drag is preserved via the sensor activation distance.
  onOpen?: () => void;
  // Lifted state for the drag overlay: a strong shadow so the moving card floats above the board.
  elevated?: boolean;
}

export function DealCard(props: DealCardProps): React.ReactNode {
  const {
    card,
    ownerName,
    ownerAvatarUrl,
    personName,
    orgName,
    labels,
    rottingDays,
    density,
    now,
    onOpen,
  } = props;
  const { elevated } = props;
  const compact = density === "compact";
  // Gate the time-derived state on a client clock. Before mount (now=null) render the neutral
  // baseline (no rot, no scheduled activity) so the server and first client render are identical.
  const activity = now === null ? "none" : activityState(card.nextActivityAt, now);
  const rot =
    now === null
      ? { rotting: false, ageDays: 0, level: 0 }
      : rottingState(card.stageEnteredAt, rottingDays, now);

  // Pipedrive parity: the deal title leads (bold primary line); the gray description line reads
  // "org, person" (comfortable only), collapsing to whichever of the two is present.
  const primary = card.title;
  const descriptionLine =
    orgName !== null && personName !== null
      ? [orgName, personName].join(STRINGS.contactSeparator)
      : (orgName ?? personName);

  return (
    <button
      type="button"
      aria-roledescription={STRINGS.roledescription}
      aria-label={card.title}
      data-deal-id={card.id}
      onClick={onOpen}
      className={cn(
        "w-full overflow-hidden rounded-lg border bg-card text-left shadow-sm transition-shadow hover:shadow-md",
        onOpen !== undefined && "cursor-pointer hover:border-ring",
        elevated === true && "rotate-1 shadow-2xl ring-1 ring-ring/30",
        compact ? "px-3 py-2" : "px-3 py-3",
        rot.level > 0 && ROT_TINT[rot.level],
      )}
    >
      {/* Primary line: the deal title leads (Pipedrive parity). */}
      <div className="truncate text-sm font-medium leading-tight">{primary}</div>

      {/* Description line: "org, person" (comfortable only). */}
      {!compact && descriptionLine !== null && (
        <div className="mt-0.5 truncate text-xs text-muted-foreground">{descriptionLine}</div>
      )}

      {/* Value + label chips row (one chip per label, Pipedrive multi-label) */}
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
        {card.value !== null && (
          <span className="font-semibold tabular-nums text-foreground">
            {formatCurrency(card.value)}
          </span>
        )}
        {labels.map((label) => (
          <span
            key={label.name}
            className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
            style={{ backgroundColor: label.color }}
          >
            {label.name}
          </span>
        ))}
      </div>

      {/* Footer: owner avatar initial + activity indicator + rotting badge */}
      <div className="mt-1 flex items-center justify-between text-xs">
        {/* Owner avatar: the uploaded photo when present, else colored initials. role="img" so the
            aria-label is valid on both. */}
        {ownerAvatarUrl !== undefined && ownerAvatarUrl !== null && ownerAvatarUrl !== "" ? (
          // biome-ignore lint/performance/noImgElement: tiny board-card avatar, next/image not warranted
          <img
            src={ownerAvatarUrl}
            alt={`owner: ${ownerName}`}
            className="h-5 w-5 shrink-0 rounded-full object-cover outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
          />
        ) : (
          <span
            role="img"
            aria-label={`owner: ${ownerName}`}
            className={cn(
              "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold uppercase",
              avatarColorClass(ownerName),
            )}
          >
            {initials(ownerName)}
          </span>
        )}

        <span className="flex items-center gap-1">
          {/* Next-action indicator: a colored circle with a chevron (Pipedrive). Color encodes
              urgency; aria-label carries the state so it is not conveyed by color alone. */}
          <span
            role="img"
            aria-label={STRINGS.activityLabel[activity]}
            data-activity={activity}
            className={cn(
              "flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold leading-none",
              STRINGS.activityCircle[activity],
            )}
          >
            <span aria-hidden="true">{STRINGS.activityGlyph[activity]}</span>
          </span>

          {/* Rotting badge: role="status" so aria-label is valid; text days = non-color cue */}
          {rot.rotting && (
            <span
              role="status"
              aria-label={`rotting, idle ${rot.ageDays} days`}
              className="rounded bg-white/80 px-1 py-0.5 text-xs font-medium tabular-nums text-red-700"
            >
              {rot.ageDays}d
            </span>
          )}
        </span>
      </div>
    </button>
  );
}
