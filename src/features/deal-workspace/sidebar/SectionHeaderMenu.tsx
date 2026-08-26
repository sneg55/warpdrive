"use client";
import { MoreHorizontal, Pencil, Sparkles } from "lucide-react";
import type React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tip } from "@/components/ui/tooltip";
import { ICON_BUTTON } from "@/constants/formStyles";
import { STRINGS } from "@/constants/strings";

export interface SectionHeaderMenuItem {
  label: string;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

interface SectionHeaderMenuProps {
  sectionLabel: string;
  // The pencil renders only when onEdit is provided. Contact/lead sidebars omit it (the funnel
  // toggle already reveals empties and inline field-click handles editing), so they show only the
  // kebab; the deal sidebar still passes onEdit for its reveal-empties pencil.
  onEdit?: () => void;
  menuItems: SectionHeaderMenuItem[];
  // Enrichment: the button renders only when a caller supplies a handler, so an install with no
  // connected provider keeps the header it had before the feature existed.
  onFillGaps?: () => void;
  fillGapsBusy?: boolean;
  // Set means the button is disabled and the text explains it in a tooltip.
  fillGapsDisabledReason?: string;
}

const SMALL_ICON_BUTTON = `${ICON_BUTTON} h-8 w-8 border-0 px-0 py-0`;

function FillGapsButton({
  onFillGaps,
  fillGapsBusy,
  fillGapsDisabledReason,
}: Required<Pick<SectionHeaderMenuProps, "onFillGaps">> &
  Pick<SectionHeaderMenuProps, "fillGapsBusy" | "fillGapsDisabledReason">): React.ReactNode {
  const button = (
    <button
      type="button"
      aria-label={STRINGS.dealSidebar.menu.fillGaps}
      disabled={fillGapsDisabledReason !== undefined || fillGapsBusy === true}
      onClick={onFillGaps}
      className={SMALL_ICON_BUTTON}
    >
      <Sparkles
        aria-hidden="true"
        className={`h-3.5 w-3.5 ${fillGapsBusy === true ? "animate-pulse" : ""}`}
      />
    </button>
  );
  if (fillGapsDisabledReason === undefined) return button;
  // A disabled button swallows pointer events, so the tooltip needs a wrapper that still gets them.
  return (
    <Tip label={fillGapsDisabledReason}>
      <span className="inline-flex">{button}</span>
    </Tip>
  );
}

export function SectionHeaderMenu({
  sectionLabel,
  onEdit,
  menuItems,
  onFillGaps,
  fillGapsBusy,
  fillGapsDisabledReason,
}: SectionHeaderMenuProps): React.ReactNode {
  return (
    <div className="flex items-center gap-1">
      {onFillGaps !== undefined && (
        <FillGapsButton
          onFillGaps={onFillGaps}
          fillGapsBusy={fillGapsBusy}
          fillGapsDisabledReason={fillGapsDisabledReason}
        />
      )}
      {onEdit !== undefined && (
        <button
          type="button"
          aria-label={STRINGS.dealSidebar.menu.editSection(sectionLabel)}
          onClick={onEdit}
          className={SMALL_ICON_BUTTON}
        >
          <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={STRINGS.dealSidebar.menu.sectionOptions(sectionLabel)}
          className={SMALL_ICON_BUTTON}
        >
          <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          {menuItems.map((item) => (
            <DropdownMenuItem
              key={item.label}
              disabled={item.disabled}
              onSelect={item.onSelect}
              className={item.destructive === true ? "text-destructive" : undefined}
            >
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
