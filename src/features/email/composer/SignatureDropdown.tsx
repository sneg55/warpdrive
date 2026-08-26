"use client";
import { Signature } from "lucide-react";
import type React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tip } from "@/components/ui/tooltip";
import { COMPOSER_STRINGS } from "./composer.constants";

interface SignatureDropdownProps {
  signatures: { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
}

// Toolbar signature picker: an icon button that opens a menu of "None" + each signature.
// Rendered as a composer toolbar control (next to SaveAsTemplateDialog) so it is always
// present, even before any signature exists, offering "None" as the explicit empty choice.
// value "" means no signature.
export function SignatureDropdown({
  signatures,
  value,
  onChange,
}: SignatureDropdownProps): React.ReactNode {
  const current =
    signatures.find((s) => s.id === value)?.name ?? COMPOSER_STRINGS.signatureNoneLabel;
  return (
    <DropdownMenu>
      <Tip label={COMPOSER_STRINGS.signatureTitle(current)}>
        <DropdownMenuTrigger
          aria-label={COMPOSER_STRINGS.signaturePickerLabel}
          className="flex items-center gap-1 rounded border border-border px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent"
        >
          <Signature aria-hidden="true" className="h-3.5 w-3.5" />
        </DropdownMenuTrigger>
      </Tip>
      <DropdownMenuContent align="start" className="min-w-32">
        <DropdownMenuItem
          aria-label={COMPOSER_STRINGS.signatureNoneLabel}
          className="text-xs"
          onSelect={() => onChange("")}
        >
          {COMPOSER_STRINGS.signatureNoneLabel}
        </DropdownMenuItem>
        {signatures.map((s) => (
          <DropdownMenuItem
            key={s.id}
            aria-label={s.name}
            className="text-xs"
            onSelect={() => onChange(s.id)}
          >
            {s.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
