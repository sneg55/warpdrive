// Per-type form control components for custom fields.
// Each component is small and focused; the dispatch lives in render.widgets.tsx.
import { Checkbox } from "@/components/ui/Checkbox";
import { DatePicker } from "@/components/ui/DatePicker";
import { Select } from "@/components/ui/Select";
import { TimePicker } from "@/components/ui/TimePicker";
import type { CustomFieldDef } from "@/types/customFields";
import type { ControlProps } from "./render.widget-types";
import { addrVal, numVal, rangeVal, strVal } from "./render.widget-types";

const SELECT_PLACEHOLDER = "-- select --";

export function TextControl({ id, def, value, onChange }: ControlProps & { id: string }) {
  return (
    <input
      id={id}
      type="text"
      value={strVal(value)}
      onChange={(e) => onChange(e.target.value)}
      aria-label={def.name}
    />
  );
}

export function LargeTextControl({ id, def, value, onChange }: ControlProps & { id: string }) {
  return (
    <textarea
      id={id}
      value={strVal(value)}
      onChange={(e) => onChange(e.target.value)}
      aria-label={def.name}
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
    <input
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
  return (
    <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
      <legend>{def.name}</legend>
      <label>
        Start
        <input
          type={inputType}
          value={r.start}
          onChange={(e) => onChange({ ...r, start: e.target.value })}
        />
      </label>
      <label>
        End
        <input
          type={inputType}
          value={r.end}
          onChange={(e) => onChange({ ...r, end: e.target.value })}
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
    <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
      <legend>{def.name}</legend>
      {pickableOptions(def, selected).map((o) => (
        <div key={o.id} className="flex items-center gap-2">
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
    <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
      <legend>{def.name}</legend>
      {fields.map(([name, label]) => (
        <label key={name} style={{ display: "block" }}>
          {label}
          <input
            type="text"
            value={a[name] ?? ""}
            onChange={(e) => onChange({ ...a, [name]: e.target.value })}
          />
        </label>
      ))}
    </fieldset>
  );
}

// Unused import suppression: CustomFieldDef is used via ControlProps
export type { CustomFieldDef };
