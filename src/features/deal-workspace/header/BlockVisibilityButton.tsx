"use client";
import { Eye } from "lucide-react";
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

export function BlockVisibilityButton({
  isHidden,
  onToggle,
}: BlockVisibilityButtonProps): React.ReactNode {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Toggle detail blocks" className={ICON_BUTTON}>
        <Eye aria-hidden="true" className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" aria-label="Detail blocks" className="min-w-44">
        {DEAL_BLOCKS.map((b) => (
          <DropdownMenuCheckboxItem
            key={b.id}
            checked={!isHidden(b.id)}
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
