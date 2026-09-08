"use client";

import { Bot } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { STRINGS } from "@/constants/strings";
import { SettingsCard, SettingsCardBody, SettingsCardHeader } from "../SettingsSurface";

const S = STRINGS.settings;

export function McpConnectCard({ endpointUrl }: { endpointUrl: string }): React.ReactNode {
  const inputId = useId();
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    await navigator.clipboard.writeText(endpointUrl);
    setCopied(true);
  }

  return (
    <SettingsCard>
      <SettingsCardHeader
        icon={<Bot className="size-4" aria-hidden="true" />}
        title={S.mcpConnectTitle}
        description={S.mcpConnectDescription}
      />
      <SettingsCardBody className="space-y-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={inputId} className="text-sm font-medium">
            {S.mcpConnectServerUrl}
          </label>
          <div className="flex gap-2">
            <Input
              id={inputId}
              readOnly
              value={endpointUrl}
              className="font-mono text-xs"
              onFocus={(event) => event.currentTarget.select()}
            />
            <Button type="button" variant="outline" onClick={() => void copy()}>
              {copied ? S.mcpConnectCopied : S.mcpConnectCopy}
            </Button>
          </div>
        </div>
        <div>
          <p className="text-sm font-medium">{S.mcpConnectStepsHeading}</p>
          <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            {S.mcpConnectSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
        <p className="text-sm text-muted-foreground">
          <a
            href={S.mcpConnectDocsUrl}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-4"
          >
            {S.mcpConnectDocsLink}
          </a>
        </p>
      </SettingsCardBody>
    </SettingsCard>
  );
}
