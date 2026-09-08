"use client";
import { ChevronDown, Menu, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import type React from "react";
import { useRef, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { STRINGS } from "@/constants/strings";
import { CreatePipelineDialog } from "@/features/pipelines/CreatePipelineDialog";
import { cn } from "@/lib/utils";

interface PipelineSelectProps {
  pipelineId: string;
  pipelines: Array<{ id: string; name: string }>;
  canManagePipelines?: boolean;
}

export function PipelineSelect(props: PipelineSelectProps): React.ReactNode {
  const { pipelineId, pipelines, canManagePipelines = false } = props;
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const current = pipelines.find((p) => p.id === pipelineId);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          ref={triggerRef}
          className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1.5 text-sm font-medium text-foreground hover:bg-accent"
        >
          <Menu aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
          <span className="max-w-40 truncate">{current?.name ?? "Pipeline"}</span>
          <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" aria-label="Select pipeline" className="min-w-44">
          {pipelines.map((p) => (
            <DropdownMenuItem
              key={p.id}
              onSelect={() => router.push(`/pipeline/${p.id}`)}
              className={cn("truncate", p.id === pipelineId && "font-semibold text-foreground")}
            >
              {p.name}
            </DropdownMenuItem>
          ))}
          {canManagePipelines && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
                <Plus aria-hidden="true" className="mr-2 h-4 w-4" />
                {STRINGS.settings.addNewPipeline}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <CreatePipelineDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated="board"
        returnFocusTo={triggerRef}
      />
    </>
  );
}
