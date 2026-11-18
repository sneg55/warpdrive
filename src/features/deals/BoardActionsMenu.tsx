"use client";
import { Ellipsis } from "lucide-react";
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

export function BoardActionsMenu(props: BoardActionsMenuProps): React.ReactNode {
  const { pipelineId } = props;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Board actions" className={ICON_BUTTON}>
        <Ellipsis aria-hidden="true" className="h-4 w-4" />
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
