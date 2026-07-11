"use client";
import Link from "next/link";
import type React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ICON_BUTTON } from "@/constants/formStyles";

interface BoardActionsMenuProps {
  pipelineId: string;
}

// Board actions overflow (Pipedrive ellipsis). Seeded with actions that already have a home:
// edit pipeline, and bulk-select via the List view (which already supports multi-select).
// Intended future entries: export deals, import, board settings (add when those features exist).
export function BoardActionsMenu(props: BoardActionsMenuProps): React.ReactNode {
  const { pipelineId } = props;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Board actions" className={ICON_BUTTON}>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </svg>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuItem asChild>
          <Link href={`/pipeline/${pipelineId}/edit`}>Edit pipeline</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/pipeline/${pipelineId}/list`}>Select multiple deals</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
