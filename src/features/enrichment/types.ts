import type { ProviderId } from "./providers/types";

// A mapping row with its target already resolved, as the merge and apply steps need it. The
// client never decides a target: it names a canonical key, and the server resolves it through here.
export interface ResolvedMapping {
  canonicalKey: string;
  label: string;
  targetKind: "builtin" | "custom";
  // Built-in field key, including an address leaf such as "address.region". Null for a custom target.
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
  // More than one entry means the providers disagreed and the row renders as a picker.
  values: ProposedValue[];
  // The variant chosen when the dialog opens: most-backed, ties broken by PROVIDER_PRIORITY.
  selectedValue: string | number;
  currentValue: string | number | null;
  // True when the target already holds a different value. Such rows start unchecked.
  isOverwrite: boolean;
  // The stored value is present but cannot be right (a person.email that is not an address). Such
  // a value has nothing worth protecting, so its replacement starts checked.
  currentInvalid: boolean;
  // The target holds a set with one member promoted, so a new value can either sit alongside the
  // others or take the promotion. Person emails are the only such target today.
  supportsPrimary: boolean;
  defaultMakePrimary: boolean;
  defaultSelected: boolean;
}

export interface Selection {
  canonicalKey: string;
  value: string | number;
  // Set targets only: promote this value over the one the record currently promotes. Ignored by
  // every other target, which has nothing to promote.
  makePrimary?: boolean;
}
