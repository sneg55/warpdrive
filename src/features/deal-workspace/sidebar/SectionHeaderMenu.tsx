"use client";
import { ListPlus, MoreHorizontal, Pencil } from "lucide-react";
import type React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  fillGapsPressed?: boolean;
  onToggleFillGaps?: () => void;
}

const SMALL_ICON_BUTTON = `${ICON_BUTTON} h-8 w-8 border-0 px-0 py-0`;

export function SectionHeaderMenu({
  sectionLabel,
  onEdit,
  menuItems,
  fillGapsPressed,
  onToggleFillGaps,
}: SectionHeaderMenuProps): React.ReactNode {
  return (
    <div className="flex items-center gap-1">
      {onToggleFillGaps !== undefined && (
        <button
          type="button"
          aria-label={STRINGS.dealSidebar.menu.fillGaps}
          aria-pressed={fillGapsPressed ?? false}
          onClick={onToggleFillGaps}
          className={SMALL_ICON_BUTTON}
        >
          <ListPlus aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
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
