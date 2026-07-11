"use client";
import type React from "react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DEAL_BLOCKS, type DealBlockId } from "@/constants/dealBlocks";
import { ICON_BUTTON } from "@/constants/formStyles";

interface BlockVisibilityButtonProps {
  isHidden: (id: DealBlockId) => boolean;
  onToggle: (id: DealBlockId) => void;
}

// Eye + chevron button (Pipedrive block-visibility). Opens a checkbox menu, one per detail block;
// unchecking hides that section on the page. State + persistence live in useBlockVisibility.
export function BlockVisibilityButton({
  isHidden,
  onToggle,
}: BlockVisibilityButtonProps): React.ReactNode {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Toggle detail blocks" className={ICON_BUTTON}>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" aria-label="Detail blocks" className="min-w-44">
        {DEAL_BLOCKS.map((b) => (
          <DropdownMenuCheckboxItem
            key={b.id}
            checked={!isHidden(b.id)}
            // Keep the menu open while toggling several blocks in a row.
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={() => onToggle(b.id)}
          >
            {b.name}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
