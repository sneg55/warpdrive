// Per-type form control components for custom fields.
// Each component is small and focused; the dispatch lives in render.widgets.tsx.
import { Checkbox } from "@/components/ui/Checkbox";
import { Combobox, type ComboboxOption } from "@/components/ui/Combobox";
import { DatePicker } from "@/components/ui/DatePicker";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { TimePicker } from "@/components/ui/TimePicker";
import { trpc } from "@/lib/trpc-client";
import type { CustomFieldDef } from "@/types/customFields";
import type { ControlProps } from "./render.widget-types";
import { addrVal, numVal, rangeVal, strVal } from "./render.widget-types";

const SELECT_PLACEHOLDER = "-- select --";

export function TextControl({ id, def, value, onChange }: ControlProps & { id: string }) {
  return (
    <Input
      id={id}
      type="text"
      value={strVal(value)}
      onChange={(e) => onChange(e.target.value)}
      aria-label={def.name}
      className="h-8 px-2 py-1"
    />
  );
}

export function LargeTextControl({ id, def, value, onChange }: ControlProps & { id: string }) {
  return (
    <Textarea
      id={id}
      value={strVal(value)}
      onChange={(e) => onChange(e.target.value)}
      aria-label={def.name}
      className="min-h-20 px-2 py-1.5"
    />
  );
}

export function NumericControl({
  id,
  def,
  value,
  onChange,
  step,
  min,
  max,
}: ControlProps & { id: string; step?: string; min?: number; max?: number }) {
  return (
    <Input
      id={id}
      type="number"
      step={step}
      min={min}
      max={max}
      value={numVal(value)}
      onChange={(e) => {
        // Commit-boundary guard: a cleared input is null (not NaN), and a value outside a
        // configured bound (e.g. a negative on a monetary field with min=0) is not committed.
        const n = e.target.valueAsNumber;
        if (Number.isNaN(n)) {
          onChange(null);
          return;
        }
        if (min !== undefined && n < min) return;
        if (max !== undefined && n > max) return;
        onChange(n);
      }}
      aria-label={def.name}
      className="h-8 px-2 py-1"
    />
  );
}

export function DateControl({ def, value, onChange }: ControlProps & { id: string }) {
  const v = strVal(value);
  return (
    <DatePicker
      ariaLabel={def.name}
      value={v === "" ? null : v}
      onChange={(next) => onChange(next ?? "")}
    />
  );
}

export function TimeControl({ def, value, onChange }: ControlProps & { id: string }) {
  return <TimePicker ariaLabel={def.name} value={strVal(value)} onChange={onChange} />;
}

export function RangeControl({
  def,
  value,
  onChange,
  inputType,
}: ControlProps & { inputType: "date" | "time" }) {
  const r = rangeVal(value);
  const startId = `cf-${def.key}-${inputType}-start`;
  const endId = `cf-${def.key}-${inputType}-end`;
  return (
    <fieldset className="m-0 space-y-2 border-0 p-0">
      <legend className="sr-only">{def.name}</legend>
      <label htmlFor={startId} className="block text-xs font-medium text-muted-foreground">
        Start
        <Input
          id={startId}
          type={inputType}
          value={r.start}
          onChange={(e) => onChange({ ...r, start: e.target.value })}
          className="mt-1 h-8 px-2 py-1 text-foreground"
        />
      </label>
      <label htmlFor={endId} className="block text-xs font-medium text-muted-foreground">
        End
        <Input
          id={endId}
          type={inputType}
          value={r.end}
          onChange={(e) => onChange({ ...r, end: e.target.value })}
          className="mt-1 h-8 px-2 py-1 text-foreground"
        />
      </label>
    </fieldset>
  );
}

// Options archived in settings are dropped from the picker so they cannot be chosen for new
// records, but an option that is already the stored value stays visible so historical data
// still reads correctly and can be deselected.
function pickableOptions(def: ControlProps["def"], selectedIds: string[]) {
  return def.options.filter((o) => o.archived !== true || selectedIds.includes(o.id));
}

export function SingleOptionControl({ def, value, onChange }: ControlProps & { id: string }) {
  const current = strVal(value);
  return (
    <Select
      ariaLabel={def.name}
      value={current}
      onChange={onChange}
      placeholder={SELECT_PLACEHOLDER}
      options={[
        { value: "", label: SELECT_PLACEHOLDER },
        ...pickableOptions(def, current === "" ? [] : [current]).map((o) => ({
          value: o.id,
          label: o.label,
        })),
      ]}
    />
  );
}

export function MultiOptionControl({ def, value, onChange }: ControlProps) {
  const selected = Array.isArray(value) ? (value as string[]) : [];
  return (
    <fieldset className="m-0 space-y-1 border-0 p-0">
      <legend className="sr-only">{def.name}</legend>
      {pickableOptions(def, selected).map((o) => (
        <div key={o.id} className="flex min-h-8 items-center gap-2 rounded px-1 hover:bg-accent">
          <Checkbox
            label={o.label}
            checked={selected.includes(o.id)}
            onCheckedChange={(v) => {
              const next = v ? [...selected, o.id] : selected.filter((s) => s !== o.id);
              onChange(next);
            }}
          />
          {o.label}
        </div>
      ))}
    </fieldset>
  );
}

export function ReferenceControl({ def, value, onChange }: ControlProps) {
  const usersQ = trpc.identity.assignableUsers.useQuery(undefined, {
    enabled: def.type === "user",
    retry: false,
  });
  const peopleQ = trpc.contacts.personOptions.useQuery(undefined, {
    enabled: def.type === "person",
    retry: false,
  });
  const orgsQ = trpc.contacts.orgOptions.useQuery(undefined, {
    enabled: def.type === "org",
    retry: false,
  });

  let options: ComboboxOption[] = [];
  let loading = false;
  if (def.type === "user") {
    loading = usersQ.isLoading;
    options = (usersQ.data ?? []).map((option) => ({
      value: option.id,
      label: option.name,
      avatarName: option.name,
      avatarUrl: option.avatarUrl,
    }));
  } else if (def.type === "person") {
    loading = peopleQ.isLoading;
    options = (peopleQ.data ?? []).map((option) => ({ value: option.id, label: option.name }));
  } else {
    loading = orgsQ.isLoading;
    options = (orgsQ.data ?? []).map((option) => ({ value: option.id, label: option.name }));
  }

  return (
    <Combobox
      ariaLabel={def.name}
      value={strVal(value)}
      onChange={onChange}
      placeholder={loading ? "Loading..." : `Select ${def.type}`}
      options={[{ value: "", label: "None" }, ...options]}
    />
  );
}

export function AddressControl({ def, value, onChange }: ControlProps) {
  const a = addrVal(value);
  const fields: Array<[string, string]> = [
    ["street", "Street"],
    ["city", "City"],
    ["region", "Region"],
    ["postal", "Postal"],
    ["country", "Country"],
  ];
  return (
    <fieldset className="m-0 space-y-2 border-0 p-0">
      <legend className="sr-only">{def.name}</legend>
      {fields.map(([name, label]) => {
        const id = `cf-${def.key}-${name}`;
        return (
          <label
            key={name}
            htmlFor={id}
            className="block text-xs font-medium text-muted-foreground"
          >
            {label}
            <Input
              id={id}
              type="text"
              value={a[name] ?? ""}
              onChange={(e) => onChange({ ...a, [name]: e.target.value })}
              className="mt-1 h-8 px-2 py-1 text-foreground"
            />
          </label>
        );
      })}
    </fieldset>
  );
}

// Unused import suppression: CustomFieldDef is used via ControlProps
export type { CustomFieldDef };
