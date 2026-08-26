// AddActivityToggle: footer checkbox that (when checked) causes a successful
// email send to log a deal-linked activity. Only rendered in deal context.

import { ToggleField } from "@/components/ui/ToggleField";
import { Tip } from "@/components/ui/tooltip";
import { COMPOSER_STRINGS } from "./composer.constants";

interface AddActivityToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
}

export function AddActivityToggle({ checked, onChange }: AddActivityToggleProps): React.ReactNode {
  return (
    <ToggleField
      label={COMPOSER_STRINGS.addAsActivityLabel}
      checked={checked}
      onCheckedChange={onChange}
    >
      <Tip label={COMPOSER_STRINGS.addAsActivityTooltip}>
        <span
          role="img"
          aria-label={COMPOSER_STRINGS.addAsActivityTooltip}
          className="inline-flex items-center justify-center h-3.5 w-3.5 rounded-full border border-muted-foreground/40 text-muted-foreground/70 text-[10px] leading-none ml-0.5 cursor-help"
        >
          i
        </span>
      </Tip>
    </ToggleField>
  );
}
