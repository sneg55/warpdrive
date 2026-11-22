import type React from "react";
import { Tip } from "@/components/ui/tooltip";
import { avatarColorClass, initials } from "@/lib/avatar";
import { formatCurrency } from "@/lib/formatCurrency";
import { cn } from "@/lib/utils";
import type { ActivityState } from "./cardIndicators";
import { activityState, activityTooltip, rottingState } from "./cardIndicators";
import { DealStatusBadge } from "./DealStatusBadge";
import type { BoardCard } from "./dealRepo";

const STRINGS = {
  roledescription: "draggable deal card",
  contactSeparator: ", ",
  activityCircle: {
    upcoming: "bg-scheduled text-scheduled-foreground",
    today: "bg-action text-action-foreground",
    overdue: "bg-destructive text-destructive-foreground",
    none: "bg-attention text-attention-foreground",
  } satisfies Record<ActivityState, string>,
  activityGlyph: {
    upcoming: "›",
    today: "›",
    overdue: "›",
    none: "!",
  } satisfies Record<ActivityState, string>,
} as const;

const ROT_TINT: Record<number, string> = {
  1: "bg-red-50 border-l-4 border-l-red-400 dark:bg-[#1e1113] dark:border-l-[#b91c1c]",
  2: "bg-red-100 border-l-4 border-l-red-500 dark:bg-[#2a1416] dark:border-l-[#dc2626]",
  3: "bg-red-200 border-l-4 border-l-red-600 dark:bg-[#3a181b] dark:border-l-[#ef4444]",
} as const;

interface DealCardProps {
  card: BoardCard;
  ownerName: string;
  ownerAvatarUrl?: string | null;
  personName: string | null;
  orgName: string | null;
  labels: Array<{ name: string; color: string }>;
  rottingDays: number | null;
  density: "comfortable" | "compact";
  now: Date;
  currency: string;
  onOpen?: () => void;
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
  const { elevated, currency } = props;
  const compact = density === "compact";
  const activity = activityState(card.nextActivityAt, now);
  const activityTip = activityTooltip(card.nextActivityTitle ?? null, card.nextActivityAt, now);
  const closed = card.status === "won" || card.status === "lost";
  const rot = rottingState(card.stageEnteredAt, closed ? null : rottingDays, now);

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
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 truncate text-sm font-medium leading-tight">{primary}</div>
        <DealStatusBadge status={card.status} />
      </div>

      {!compact && descriptionLine !== null && (
        <div className="mt-0.5 truncate text-xs text-muted-foreground">{descriptionLine}</div>
      )}

      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
        {card.value !== null && (
          <span className="font-semibold tabular-nums text-foreground">
            {formatCurrency(card.value, currency)}
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

      <div className="mt-1 flex items-center justify-between text-xs">
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
          <Tip label={activityTip} side="top">
            <span
              role="img"
              aria-label={activityTip}
              data-activity={activity}
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold leading-none",
                STRINGS.activityCircle[activity],
              )}
            >
              <span aria-hidden="true">{STRINGS.activityGlyph[activity]}</span>
            </span>
          </Tip>

          {rot.rotting && (
            <span
              role="status"
              aria-label={`rotting, idle ${rot.ageDays} days`}
              className="rounded bg-white/80 px-1 py-0.5 text-xs font-medium tabular-nums text-red-700 dark:bg-black/40 dark:text-red-300"
            >
              {rot.ageDays}d
            </span>
          )}
        </span>
      </div>
    </button>
  );
}
