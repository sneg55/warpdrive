import type { ProviderId } from "./providers/types";

export interface ResolvedMapping {
  canonicalKey: string;
  label: string;
  targetKind: "builtin" | "custom";
  targetKey: string | null;
  targetFieldDefId: string | null;
}

export interface ProposedValue {
  value: string | number;
  providers: ProviderId[];
}

export interface ProposedField {
  canonicalKey: string;
  label: string;
  values: ProposedValue[];
  selectedValue: string | number;
  currentValue: string | number | null;
  isOverwrite: boolean;
  currentInvalid: boolean;
  supportsPrimary: boolean;
  defaultMakePrimary: boolean;
  defaultSelected: boolean;
}

export interface Selection {
  canonicalKey: string;
  value: string | number;
  makePrimary?: boolean;
}
