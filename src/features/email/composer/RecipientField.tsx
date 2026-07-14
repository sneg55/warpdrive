"use client";
import { useState } from "react";
import { isValidEmail } from "@/lib/isValidEmail";
import { trpc } from "@/lib/trpc-client";

// Must match contacts router max (src/features/contacts/router.ts listPeople max:500).
// Fetch the full allowed page so all contacts are available for autocomplete.
const CONTACTS_AUTOCOMPLETE_LIMIT = 500;

interface RecipientFieldProps {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
}

// Custom chip input + autocomplete panel (kept, not migrated to ui/MultiCombobox). MultiCombobox
// can only toggle values that exist in a fixed option list, so it cannot represent the two things a
// recipient field must do: accept an arbitrary free-typed email (type + Enter, validated) that is
// not a known contact, and render that email as a chip. Its value model is email strings, not
// option ids, and its options are remote-fetched contacts (the async-search case the spec flags as
// legitimately custom). A trigger-button popover would also break the inline "To:" pixel parity.
export function RecipientField({ label, values, onChange }: RecipientFieldProps): React.ReactNode {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data } = trpc.contacts.listPeople.useQuery({
    offset: 0,
    limit: CONTACTS_AUTOCOMPLETE_LIMIT,
  });
  const people = data?.rows ?? [];

  const suggestions =
    query.length > 0
      ? people.filter(
          (p) =>
            p.primaryEmail != null &&
            (p.name.toLowerCase().includes(query.toLowerCase()) ||
              p.primaryEmail.toLowerCase().includes(query.toLowerCase())) &&
            !values.includes(p.primaryEmail),
        )
      : [];

  function addEmail(email: string): void {
    const trimmed = email.trim();
    if (trimmed.length === 0 || values.includes(trimmed)) return;
    if (!isValidEmail(trimmed)) {
      setError("Enter a valid email address.");
      return;
    }
    setError(null);
    onChange([...values, trimmed]);
    setQuery("");
    setOpen(false);
  }

  function removeEmail(email: string): void {
    onChange(values.filter((v) => v !== email));
  }

  return (
    <div className="relative flex flex-wrap items-center gap-1 border-b border-border px-2 py-1">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      {values.map((v) => (
        <span key={v} className="flex items-center gap-0.5 rounded bg-accent px-1.5 py-0.5 text-xs">
          {v}
          <button
            type="button"
            aria-label={`Remove ${v}`}
            onClick={() => removeEmail(v)}
            className="ml-0.5 hover:opacity-70"
          >
            &times;
          </button>
        </span>
      ))}
      <input
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open && suggestions.length > 0}
        className="flex-1 min-w-20 text-sm focus:outline-none bg-transparent"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (error !== null) setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && query.trim().length > 0) {
            e.preventDefault();
            addEmail(query);
          }
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && suggestions.length > 0 && (
        <div className="absolute left-0 top-full z-10 mt-1 w-full rounded border border-border bg-background shadow-md">
          {suggestions.map((p) => (
            <div key={p.id}>
              <button
                type="button"
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent"
                onMouseDown={(e) => {
                  e.preventDefault(); // keep focus on the input so onBlur doesn't fire first
                  if (p.primaryEmail != null) addEmail(p.primaryEmail);
                }}
              >
                {p.name}
                {p.primaryEmail != null && p.primaryEmail !== p.name && (
                  <span className="ml-1 text-xs text-muted-foreground">{p.primaryEmail}</span>
                )}
              </button>
            </div>
          ))}
        </div>
      )}
      {error !== null && <p className="w-full text-xs text-destructive">{error}</p>}
    </div>
  );
}
