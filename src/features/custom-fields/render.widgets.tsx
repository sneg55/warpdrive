// Custom-field widget dispatch: CustomFieldDetail (read-only) and
// CustomFieldFormControl (editable). Controls use the shared shadcn-style UI primitives.
import { assertNever } from "@/types/result";
import { formatCustomFieldDisplay } from "./render";
import {
  AddressControl,
  DateControl,
  LargeTextControl,
  MultiOptionControl,
  NumericControl,
  RangeControl,
  ReferenceControl,
  SingleOptionControl,
  TextControl,
  TimeControl,
} from "./render.widget-controls";
import type { ControlProps, DetailProps } from "./render.widget-types";

export function CustomFieldDetail({ def, value, currency }: DetailProps) {
  // tabular-nums keeps numeric/monetary values from jittering column width as they update;
  // text-pretty avoids orphan words when a multi-line large_text value wraps.
  const numeric = def.type === "numeric" || def.type === "monetary";
  const multiline = def.type === "large_text";
  const className = `custom-field-detail${numeric ? " tabular-nums" : ""}${
    multiline ? " text-pretty" : ""
  }`;
  return <span className={className}>{formatCustomFieldDisplay(def, value, currency)}</span>;
}

export function CustomFieldFormControl({ def, value, onChange }: ControlProps) {
  const id = `cf-${def.key}`;

  switch (def.type) {
    case "text":
    case "autocomplete":
    case "phone":
      return <TextControl id={id} def={def} value={value} onChange={onChange} />;
    case "large_text":
      return <LargeTextControl id={id} def={def} value={value} onChange={onChange} />;
    case "numeric":
      return <NumericControl id={id} def={def} value={value} onChange={onChange} />;
    case "monetary":
      return (
        <NumericControl id={id} def={def} value={value} onChange={onChange} step="0.01" min={0} />
      );
    case "date":
      return <DateControl id={id} def={def} value={value} onChange={onChange} />;
    case "time":
      return <TimeControl id={id} def={def} value={value} onChange={onChange} />;
    case "date_range":
      return <RangeControl def={def} value={value} onChange={onChange} inputType="date" />;
    case "time_range":
      return <RangeControl def={def} value={value} onChange={onChange} inputType="time" />;
    case "single_option":
      return <SingleOptionControl id={id} def={def} value={value} onChange={onChange} />;
    case "multi_option":
      return <MultiOptionControl def={def} value={value} onChange={onChange} />;
    case "user":
    case "person":
    case "org":
      return <ReferenceControl def={def} value={value} onChange={onChange} />;
    case "address":
      return <AddressControl def={def} value={value} onChange={onChange} />;
    default:
      return assertNever(def.type);
  }
}
