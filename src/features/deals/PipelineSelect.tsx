"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface PipelineSelectProps {
  pipelineId: string;
  pipelines: Array<{ id: string; name: string }>;
}

// Always-shown styled pipeline selector (Pipedrive convention): a button with the pipeline icon,
// current name, and a caret, opening a menu of selectable pipelines. Shown even for a single one.
export function PipelineSelect(props: PipelineSelectProps): React.ReactNode {
  const { pipelineId, pipelines } = props;
  const router = useRouter();

  const current = pipelines.find((p) => p.id === pipelineId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1.5 text-sm font-medium text-foreground hover:bg-accent">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-4 w-4 text-muted-foreground"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
        <span className="max-w-40 truncate">{current?.name ?? "Pipeline"}</span>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
          <path d="M7 10l5 5 5-5z" />
        </svg>
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
