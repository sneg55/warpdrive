import type { CustomFieldOption } from "@/types/customFields";

// The client contract for a custom-field row. options carries the full
// { id, label, archived? } shape so the option editor can target immutable ids.
export interface FieldRow {
  id: string;
  name: string;
  type: string;
  options: CustomFieldOption[];
  isImportant: boolean;
  showInAddForm: boolean;
}

// A built-in (code-defined) field row for the settings list. `locked` fields (identity keys)
// carry no Hidden toggle; `hidden` reflects the current override.
export interface BuiltinRow {
  key: string;
  label: string;
  locked: boolean;
  hidden: boolean;
}
