"use client";
import type React from "react";
import { useMemo, useState } from "react";
import { FIELD_INPUT as FIELD } from "@/constants/formStyles";
import type { Option } from "./modalState";
import { findSimilarOptions } from "./similarMatch";

export type EntityPick = { kind: "existing"; id: string } | { kind: "new"; name: string };

export interface EntityComboboxProps {
  label: string;
  options: Option[];
  createLabel: (query: string) => string;
  onSelectExisting: (id: string) => void;
  onCreateNew: (name: string) => void;
  onClear: () => void;
  onPick?: (pick: EntityPick) => void;
  excludeIds?: ReadonlySet<string>;
  defaultOptions?: Option[];
  placeholder?: string;
  similarWarning?: string;
  hideLabel?: boolean;
  initialValue?: Option;
}

const MENU =
  "absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-auto rounded-md border bg-popover shadow-md";
const ROW = "block w-full px-2.5 py-1.5 text-left text-sm hover:bg-accent";

export function EntityCombobox(props: EntityComboboxProps): React.ReactNode {
  const { label, options, createLabel, onSelectExisting, onCreateNew, onClear, placeholder } =
    props;
  const { similarWarning, hideLabel, onPick, excludeIds, defaultOptions, initialValue } = props;
  const [query, setQuery] = useState(initialValue?.name ?? "");
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<"existing" | "new" | null>(
    initialValue === undefined ? null : "existing",
  );
  const [selected, setSelected] = useState<Option | undefined>(initialValue);
  const keepsSelection = (text: string): boolean =>
    selected !== undefined && text === selected.name.trim();

  const q = query.trim().toLowerCase();
  const inReview = chosen === "new";
  const listed = useMemo(
    () => (excludeIds === undefined ? options : options.filter((o) => !excludeIds.has(o.id))),
    [options, excludeIds],
  );
  const emptyQueryListed = useMemo(() => {
    if (defaultOptions === undefined) return listed;
    const narrowed =
      excludeIds === undefined
        ? defaultOptions
        : defaultOptions.filter((o) => !excludeIds.has(o.id));
    return narrowed.length > 0 ? narrowed : listed;
  }, [defaultOptions, listed, excludeIds]);
  const similar = useMemo(
    () => (inReview && q !== "" ? findSimilarOptions(listed, query) : []),
    [inReview, q, query, listed],
  );
  const { exact, menuOptions } = useMemo(() => {
    const isExact = options.some((o) => o.name.trim().toLowerCase() === q);
    const filtered =
      q === "" ? emptyQueryListed : listed.filter((o) => o.name.toLowerCase().includes(q));
    return { exact: isExact, menuOptions: inReview ? similar : filtered };
  }, [options, listed, emptyQueryListed, q, inReview, similar]);
  const showCreate = q !== "" && !exact;
  const showWarning = inReview && similarWarning !== undefined && similar.length > 0;

  function handleChange(value: string): void {
    setQuery(value);
    setOpen(true);
    setChosen(null);
    setSelected(undefined);
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
    setSelected(option);
    setChosen("existing");
    setOpen(false);
    onSelectExisting(option.id);
    onPick?.({ kind: "existing", id: option.id });
  }

  function createNew(): void {
    const name = query.trim();
    setChosen("new");
    setOpen(false);
    onCreateNew(name);
    onPick?.({ kind: "new", name });
  }

  function commitFromKeyboard(): void {
    const text = query.trim();
    if (text === "") return;
    if (selected !== undefined && keepsSelection(text)) {
      selectExisting(selected);
      return;
    }
    const match = options.find((o) => o.name.trim().toLowerCase() === text.toLowerCase());
    if (match !== undefined) selectExisting(match);
    else createNew();
  }

  function reconcile(): void {
    const text = query.trim();
    if (keepsSelection(text)) return;
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
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
          e.preventDefault();
          commitFromKeyboard();
        }}
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
