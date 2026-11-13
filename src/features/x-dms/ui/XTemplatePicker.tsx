"use client";

import { ChevronDown } from "lucide-react";
import { useActionError } from "@/components/shell/ActionErrorProvider";
import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { applyMergeFields } from "@/features/email/merge";
import { trpc } from "@/lib/trpc-client";
import { X_DM_STRINGS } from "../strings";
import { dmMergeContext, templateHtmlToDmText } from "../templateText";

function errorIdOf(e: unknown): string | undefined {
  if (typeof e !== "object" || e === null || !("message" in e)) return undefined;
  return typeof e.message === "string" ? e.message : undefined;
}

export function XTemplatePicker({
  participantName,
  onInsert,
  disabled = false,
}: {
  participantName: string;
  onInsert: (text: string) => void;
  disabled?: boolean;
}): React.ReactNode {
  const utils = trpc.useUtils();
  const reportError = useActionError();
  const { data: templates = [] } = trpc.email.templates.list.useQuery();

  async function insert(id: string): Promise<void> {
    try {
      const template = await utils.email.templates.get.fetch({ id });
      const text = templateHtmlToDmText(template.bodyHtml);
      onInsert(applyMergeFields(text, dmMergeContext(participantName)));
    } catch (e) {
      reportError(errorIdOf(e));
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <Button variant="outline" size="sm">
          {X_DM_STRINGS.chooseTemplate}
          <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
        {templates.length === 0 ? (
          <DropdownMenuItem disabled>{X_DM_STRINGS.noTemplates}</DropdownMenuItem>
        ) : (
          templates.map((t) => (
            <DropdownMenuItem key={t.id} onSelect={() => void insert(t.id)}>
              {t.name}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
