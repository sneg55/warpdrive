import type { CustomFieldTarget, CustomFieldType } from "@/constants/customFieldTypes";

export type CustomFieldOption = { id: string; label: string; color?: string; archived?: boolean };

export type CustomFieldDef = {
  id: string;
  targetEntity: CustomFieldTarget;
  type: CustomFieldType;
  name: string;
  key: string;
  options: CustomFieldOption[];
  isRequired: boolean;
  isImportant: boolean;
  showInAddForm: boolean;
  order: number;
  archivedAt: Date | null;
};

export type CustomFieldValues = Record<string, unknown>;
