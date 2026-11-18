"use client";
import type React from "react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { LabelTarget } from "@/constants/labelColors";
import { LABEL_DOT_CLASSES } from "@/constants/labelColors";
import { trpc } from "@/lib/trpc-client";

const LABELS_SETTINGS_HREF = "/settings/company/labels";

interface CatalogLabelPickerProps {
  target: LabelTarget;
  value: string[];
  onChange: (names: string[]) => void;
}

export function CatalogLabelPicker({
  target,
  value,
  onChange,
}: CatalogLabelPickerProps): React.ReactNode {
  const catalog = trpc.labels.listByTarget.useQuery({ target }).data ?? [];

  function isActive(name: string): boolean {
    return value.some((v) => v.toLowerCase() === name.toLowerCase());
  }

  function toggle(name: string): void {
    onChange(
      isActive(name)
        ? value.filter((v) => v.toLowerCase() !== name.toLowerCase())
        : [...value, name],
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground hover:border-muted-foreground hover:text-foreground">
        + Add labels
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" aria-label="Labels" className="min-w-52">
        {catalog.length === 0 ? (
          <DropdownMenuItem disabled>No labels yet</DropdownMenuItem>
        ) : (
          catalog.map((label) => (
            <DropdownMenuCheckboxItem
              key={label.id}
              redactLabel
              checked={isActive(label.name)}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => toggle(label.name)}
            >
              <span
                aria-hidden="true"
                className={`mr-2 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${LABEL_DOT_CLASSES[label.color]}`}
              />
              {label.name}
            </DropdownMenuCheckboxItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href={LABELS_SETTINGS_HREF}>Create new label</a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
