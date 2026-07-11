"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { FIELD_INPUT } from "@/constants/formStyles";
import { STRINGS } from "@/constants/strings";
import { updateCompanyGeneralAction } from "@/features/settings/actions";
import { readCsrfToken } from "@/utils/csrfCookie";

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
    <div className="max-w-md space-y-4">
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{STRINGS.settings.companyName}</span>
        <input
          aria-label={STRINGS.settings.companyName}
          value={companyName}
          onChange={(e) => {
            setCompanyName(e.target.value);
            setSaved(false);
          }}
          className={FIELD_INPUT}
        />
      </label>

      <div>
        <span className="mb-1 block text-sm font-medium">{STRINGS.settings.baseCurrency}</span>
        <p className="text-sm text-muted-foreground">{props.baseCurrency}</p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => void save()}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-transform hover:opacity-90 active:not-disabled:scale-[0.96] disabled:opacity-50"
        >
          {STRINGS.settings.save}
        </button>
        {saved && <span className="text-sm text-muted-foreground">{STRINGS.settings.saved}</span>}
      </div>
    </div>
  );
}
