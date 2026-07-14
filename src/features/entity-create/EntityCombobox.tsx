"use client";
import type React from "react";
import { useMemo, useState } from "react";
import { FIELD_INPUT as FIELD } from "@/constants/formStyles";
import type { Option } from "./modalState";
import { findSimilarOptions } from "./similarMatch";

export interface EntityComboboxProps {
  label: string;
  options: Option[];
  createLabel: (query: string) => string; // e.g. (q) => `Add '${q}' as new organization`
  onSelectExisting: (id: string) => void;
  onCreateNew: (name: string) => void;
  onClear: () => void;
  placeholder?: string;
  // Shown under the field after choosing "create new" when an existing option looks like a
  // duplicate (e.g. "Similar organization already exists."). Omit to disable the warning.
  similarWarning?: string;
  // Visually hide the label (kept for screen readers via the input's aria-label). Used where the
  // surrounding surface is labelless, e.g. the deal Summary's inline org row.
  hideLabel?: boolean;
}

// Custom autocomplete panel (kept, not migrated to ui/Combobox). The cmdk-based Combobox is a
// pick-from-a-known-list picker (trigger button + chevron popover) that owns its input internally
// and only emits a chosen option value. This field is fundamentally different: it is an inline
// editable text input that (a) commits arbitrary free text as a create-new record, (b) hands the
// live query text back to the parent every keystroke (for createLabel + onCreateNew/onClear), and
// (c) runs a bespoke Levenshtein "Review" mode surfacing near-duplicates that are not substrings of
// the query. cmdk models none of that, and swapping to a trigger button would break pixel parity.
const MENU =
  "absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-auto rounded-md border bg-popover shadow-md";
const ROW = "block w-full px-2.5 py-1.5 text-left text-sm hover:bg-accent";

// Pipedrive-style select-or-create field: a text input that searches existing options as you type
// and offers a "create new" row when the query matches none. Fully owns its query text; the parent
// only hears about committed choices (select existing id, create new by name, or clear).
export function EntityCombobox(props: EntityComboboxProps): React.ReactNode {
  const { label, options, createLabel, onSelectExisting, onCreateNew, onClear, placeholder } =
    props;
  const { similarWarning, hideLabel } = props;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<"existing" | "new" | null>(null);

  const q = query.trim().toLowerCase();
  // In "review" mode (after committing a create) the menu offers the near-duplicates so the user can
  // pick one instead; those are not necessarily substrings of the typed name, so use similar-match.
  const inReview = chosen === "new";
  // The similar-match scan (normalize + Levenshtein over every option) is only needed in review
  // mode, so gate it there; useMemo keeps focus/open toggles from re-running the list work.
  const similar = useMemo(
    () => (inReview && q !== "" ? findSimilarOptions(options, query) : []),
    [inReview, q, query, options],
  );
  const { exact, menuOptions } = useMemo(() => {
    const isExact = options.some((o) => o.name.trim().toLowerCase() === q);
    const filtered = q === "" ? options : options.filter((o) => o.name.toLowerCase().includes(q));
    return { exact: isExact, menuOptions: inReview ? similar : filtered };
  }, [options, q, inReview, similar]);
  const showCreate = q !== "" && !exact;
  // Warn only once the user has committed to creating new and the typed name looks like a duplicate.
  const showWarning = inReview && similarWarning !== undefined && similar.length > 0;

  function handleChange(value: string): void {
    setQuery(value);
    setOpen(true);
    setChosen(null);
    // Commit the typed value to the parent on every keystroke (not only on blur/selection), so a
    // submit that fires before the field blurs still sees the current choice. An exact existing
    // name selects that record; any other non-empty text is a pending create-new; empty clears.
    // Kept chosen=null so the NEW badge and the similar-match review only activate on blur/select.
    const text = value.trim();
    if (text === "") {
      onClear();
      return;
    }
    const match = options.find((o) => o.name.trim().toLowerCase() === text.toLowerCase());
    if (match !== undefined) onSelectExisting(match.id);
    else onCreateNew(text);
  }

  function selectExisting(option: Option): void {
    setQuery(option.name);
    setChosen("existing");
    setOpen(false);
    onSelectExisting(option.id);
  }

  function createNew(): void {
    const name = query.trim();
    setChosen("new");
    setOpen(false);
    onCreateNew(name);
  }

  // Free-text commit: on blur, reconcile whatever the user typed into a committed choice so the
  // visible text and the saved value never diverge. Empty clears; an exact existing name selects
  // that record; anything else becomes a create-new. Menu clicks use onMouseDown (which fires
  // before blur), so an explicit selection has already committed by the time this runs.
  function reconcile(): void {
    const text = query.trim();
    if (text === "") {
      setChosen(null);
      onClear();
      return;
    }
    const match = options.find((o) => o.name.trim().toLowerCase() === text.toLowerCase());
    if (match !== undefined) {
      setQuery(match.name);
      setChosen("existing");
      onSelectExisting(match.id);
      return;
    }
    setChosen("new");
    onCreateNew(text);
  }

  return (
    <label className="relative block text-sm">
      <span className={hideLabel === true ? "sr-only" : "mb-1 block font-medium"}>{label}</span>
      <input
        aria-label={label}
        type="text"
        autoComplete="off"
        value={query}
        placeholder={placeholder}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          reconcile();
        }}
        className={FIELD}
      />
      {chosen === "new" && query.trim() !== "" && (
        <span className="pointer-events-none absolute right-2.5 top-8 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
          NEW
        </span>
      )}
      {showWarning && (
        <p className="mt-1 flex items-center gap-1 text-xs text-amber-600">
          <span aria-hidden="true">&#9888;</span>
          <span>{similarWarning}</span>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              setOpen(true);
            }}
            className="font-medium text-primary underline"
          >
            Review
          </button>
        </p>
      )}
      {open && (menuOptions.length > 0 || (showCreate && !inReview)) && (
        // onMouseDown fires before the input's blur, so the choice commits before the menu closes.
        <div className={MENU}>
          {menuOptions.map((o) => (
            <div key={o.id}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectExisting(o);
                }}
                className={ROW}
              >
                {o.name}
              </button>
            </div>
          ))}
          {showCreate && !inReview && (
            <div>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  createNew();
                }}
                className={`${ROW} font-medium text-primary`}
              >
                + {createLabel(query.trim())}
              </button>
            </div>
          )}
        </div>
      )}
    </label>
  );
}
