import type { CustomFieldOption } from "@/types/customFields";

export interface FieldRow {
  id: string;
  name: string;
  type: string;
  options: CustomFieldOption[];
  isImportant: boolean;
  showInAddForm: boolean;
}

export interface BuiltinRow {
  key: string;
  label: string;
  locked: boolean;
  hidden: boolean;
}
