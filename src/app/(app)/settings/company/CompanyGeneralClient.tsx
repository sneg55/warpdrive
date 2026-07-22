"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { STRINGS } from "@/constants/strings";
import { updateCompanyGeneralAction } from "@/features/settings/actions";
import { readCsrfToken } from "@/utils/csrfCookie";
import { SettingsCard, SettingsCardBody, SettingsCardFooter } from "../SettingsSurface";

interface Props {
  companyName: string;
  baseCurrency: string;
}

// General tab (spec 6.1): editable company name + read-only base currency (currencies out of scope).
export function CompanyGeneralClient(props: Props): React.ReactNode {
  const router = useRouter();
  const [companyName, setCompanyName] = useState(props.companyName);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save(): Promise<void> {
    setPending(true);
    setSaved(false);
    const r = await updateCompanyGeneralAction({ companyName }, readCsrfToken());
    setPending(false);
    if (r.ok) {
      setSaved(true);
      router.refresh();
    }
  }

  return (
    <SettingsCard>
      <SettingsCardBody className="grid gap-5 sm:grid-cols-2">
        <label htmlFor="company-name" className="block">
          <span className="mb-1.5 block text-sm font-medium">{STRINGS.settings.companyName}</span>
          <Input
            id="company-name"
            aria-label={STRINGS.settings.companyName}
            value={companyName}
            onChange={(e) => {
              setCompanyName(e.target.value);
              setSaved(false);
            }}
          />
        </label>

        <div>
          <span className="mb-1.5 block text-sm font-medium">{STRINGS.settings.baseCurrency}</span>
          <div className="flex min-h-9 items-center rounded-md bg-muted/50 px-3 text-sm text-muted-foreground">
            {props.baseCurrency}
          </div>
        </div>
      </SettingsCardBody>

      <SettingsCardFooter>
        {saved ? (
          <span className="mr-auto text-sm text-muted-foreground">{STRINGS.settings.saved}</span>
        ) : null}
        <Button
          type="button"
          variant="default"
          size="sm"
          className="px-3"
          disabled={pending}
          onClick={() => void save()}
        >
          {STRINGS.settings.save}
        </Button>
      </SettingsCardFooter>
    </SettingsCard>
  );
}
