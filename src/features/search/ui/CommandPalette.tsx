"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SearchResultsSkeleton } from "@/components/shell/skeletons";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { SEARCH_MATCH_SEPARATOR } from "@/constants/search";
import { STRINGS } from "@/constants/strings";
import { trpc } from "@/lib/trpc-client";
import type { SearchResult, SearchResults } from "@/types/search";
import { OPEN_SEARCH_EVENT } from "./events";
import { useActiveIndex } from "./useActiveIndex";
import { useSearchHotkey } from "./useSearchHotkey";

const ROUTES: Record<"deal" | "person" | "organization" | "lead", (id: string) => string> = {
  deal: (id) => `/deals/${id}`,
  person: (id) => `/contacts/people/${id}`,
  organization: (id) => `/contacts/orgs/${id}`,
  lead: (id) => `/leads/${id}`,
};

const EMPTY_RESULTS: SearchResults = { deals: [], people: [], organizations: [], leads: [] };

const SEARCH_ERROR = "Couldn't run that search. Try again.";

export function SearchResultsList({
  results,
  activeId,
  onSelect,
}: {
  results: SearchResults;
  activeId?: string;
  onSelect: (kind: "deal" | "person" | "organization" | "lead", result: SearchResult) => void;
}) {
  return (
    <div role="listbox" aria-label={STRINGS.search.resultsLabel}>
      <Section
        heading={STRINGS.search.headingDeals}
        items={results.deals}
        empty={STRINGS.search.emptyDeals}
        activeId={activeId}
        onSelect={(r) => onSelect("deal", r)}
      />
      <Section
        heading={STRINGS.search.headingPeople}
        items={results.people}
        empty={STRINGS.search.emptyPeople}
        activeId={activeId}
        onSelect={(r) => onSelect("person", r)}
      />
      <Section
        heading={STRINGS.search.headingOrganizations}
        items={results.organizations}
        empty={STRINGS.search.emptyOrganizations}
        activeId={activeId}
        onSelect={(r) => onSelect("organization", r)}
      />
      <Section
        heading={STRINGS.search.headingLeads}
        items={results.leads}
        empty={STRINGS.search.emptyLeads}
        activeId={activeId}
        onSelect={(r) => onSelect("lead", r)}
      />
    </div>
  );
}

function Section({
  heading,
  items,
  empty,
  activeId,
  onSelect,
}: {
  heading: string;
  items: SearchResult[];
  empty: string;
  activeId?: string;
  onSelect: (r: SearchResult) => void;
}) {
  return (
    <div>
      <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {heading}
      </p>
      {items.length === 0 ? (
        <p className="px-3 py-1.5 text-sm text-muted-foreground">{empty}</p>
      ) : (
        items.map((r) => {
          const isActive = r.id === activeId;
          return (
            <button
              key={r.id}
              type="button"
              role="option"
              aria-selected={isActive}
              ref={(el) => {
                if (isActive && el && typeof el.scrollIntoView === "function") {
                  el.scrollIntoView({ block: "nearest" });
                }
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent ${
                isActive ? "bg-accent" : ""
              }`}
              onClick={() => onSelect(r)}
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{r.primary}</span>
                {r.match === null ? null : (
                  <span className="truncate text-xs text-muted-foreground">
                    {r.match.label} {SEARCH_MATCH_SEPARATOR} {r.match.snippet}
                  </span>
                )}
              </span>
              {r.secondary != null ? (
                <span className="shrink-0 text-xs text-muted-foreground">{r.secondary}</span>
              ) : null}
            </button>
          );
        })
      )}
    </div>
  );
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    const id = setTimeout(() => setDebounced(q), 150);
    return () => clearTimeout(id);
  }, [q]);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(OPEN_SEARCH_EVENT, handler);
    return () => window.removeEventListener(OPEN_SEARCH_EVENT, handler);
  }, []);

  useSearchHotkey(() => setOpen(true));

  const typed = q.trim().length > 0;
  const searched = debounced.trim().length > 0;
  const { data, error } = trpc.search.query.useQuery({ q: debounced }, { enabled: searched });
  const failed = error != null;
  const pending = typed && !failed && (data === undefined || q.trim() !== debounced.trim());

  const results = data ?? EMPTY_RESULTS;
  const { flat, active, moveDown, moveUp } = useActiveIndex(results);
  const activeId = flat[active]?.r.id;

  function close() {
    setOpen(false);
    setQ("");
    setDebounced("");
  }

  function handleSelect(kind: "deal" | "person" | "organization" | "lead", r: SearchResult) {
    close();
    router.push(ROUTES[kind](r.id));
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) close();
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        className="top-[12%] max-w-lg translate-y-0 gap-0 overflow-hidden p-0 data-[state=open]:animate-none data-[state=closed]:animate-none"
      >
        <DialogTitle className="sr-only">{STRINGS.search.placeholder}</DialogTitle>
        <div className="border-b px-3 py-2 pr-9">
          <input
            ref={inputRef}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                close();
                return;
              }
              if (e.key === "ArrowDown") {
                e.preventDefault();
                moveDown();
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                moveUp();
              } else if (e.key === "Enter") {
                e.preventDefault();
                const sel = pending || failed ? undefined : flat[active];
                if (sel !== undefined) handleSelect(sel.kind, sel.r);
              }
            }}
            placeholder={STRINGS.search.placeholder}
            className="w-full bg-transparent text-sm outline-none [&::-webkit-search-cancel-button]:appearance-none"
            aria-label="Search"
          />
        </div>
        <div className="max-h-96 overflow-y-auto">
          {!typed && !searched ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">{STRINGS.search.idle}</p>
          ) : failed ? (
            <p role="alert" className="px-3 py-4 text-sm text-destructive">
              {SEARCH_ERROR}
            </p>
          ) : pending ? (
            <SearchResultsSkeleton />
          ) : (
            <SearchResultsList results={results} activeId={activeId} onSelect={handleSelect} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
