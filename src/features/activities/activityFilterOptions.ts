import type { ComboboxOption } from "@/components/ui/Combobox";
import type { SelectOption } from "@/components/ui/Select";

export const ALL_OWNERS_OPTION: ComboboxOption = { value: "", label: "All owners" };

export const DONE_FILTER_OPTIONS: SelectOption[] = [
  { value: "open", label: "Open" },
  { value: "done", label: "Completed" },
  { value: "all", label: "All" },
];
