import type { ComboboxOption } from "@/components/ui/Combobox";
import type { SelectOption } from "@/components/ui/Select";

// Shared option sets for the activities owner + status filters, used by both the list toolbar
// (ActivitiesFilters) and the calendar toolbar (CalendarFilterBar) so the two stay in sync.
export const ALL_OWNERS_OPTION: ComboboxOption = { value: "", label: "All owners" };

export const DONE_FILTER_OPTIONS: SelectOption[] = [
  { value: "open", label: "Open" },
  { value: "done", label: "Completed" },
  { value: "all", label: "All" },
];
