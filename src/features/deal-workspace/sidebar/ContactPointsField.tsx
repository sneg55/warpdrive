"use client";
import { X } from "lucide-react";
import type React from "react";
import { Input } from "@/components/ui/Input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/RadioGroup";
import { MAX_EMAIL_LEN, MAX_PHONE_LEN } from "@/features/contacts/fieldBounds";
import type { ContactPoint } from "@/types/contactPoint";
import { LinkValue, mailtoHref, telHref } from "./contactLinks";
import {
  appendPoint,
  DEFAULT_POINT_LABEL,
  parsePoints,
  removePointAt,
  serializePoints,
  setPrimaryAt,
  setValueAt,
} from "./contactPoints";

export type ContactPointKind = "Email" | "Phone";

const NOUN: Record<ContactPointKind, string> = { Email: "email", Phone: "phone" };
const MAX_LEN: Record<ContactPointKind, number> = {
  Email: MAX_EMAIL_LEN,
  Phone: MAX_PHONE_LEN,
};

function href(kind: ContactPointKind, value: string): string {
  return kind === "Email" ? mailtoHref(value) : telHref(value);
}

export function ContactPointsValue({
  points,
  kind,
}: {
  points: readonly ContactPoint[];
  kind: ContactPointKind;
}): React.ReactNode {
  return (
    <span className="flex w-full min-w-0 flex-col items-start gap-0.5">
      {points.map((point, index) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: positional contact rows
          key={index}
          className="min-w-0 max-w-full break-words"
        >
          <LinkValue href={href(kind, point.value)}>{point.value}</LinkValue>
        </span>
      ))}
    </span>
  );
}

const BLANK: ContactPoint = { label: DEFAULT_POINT_LABEL, value: "", primary: true };

export function contactPointsEditor(kind: ContactPointKind) {
  return ({
    draft,
    setDraft,
    disabled = false,
  }: {
    draft: string;
    setDraft: (v: string) => void;
    disabled?: boolean;
  }): React.ReactNode => (
    <ContactPointsEditor kind={kind} draft={draft} setDraft={setDraft} disabled={disabled} />
  );
}

export function ContactPointsEditor({
  kind,
  draft,
  setDraft,
  disabled = false,
}: {
  kind: ContactPointKind;
  draft: string;
  setDraft: (v: string) => void;
  disabled?: boolean;
}): React.ReactNode {
  const parsed = parsePoints(draft);
  const rows = parsed.length === 0 ? [BLANK] : parsed;
  const noun = NOUN[kind];
  const primaryIndex = Math.max(
    rows.findIndex((p) => p.primary),
    0,
  );
  const commit = (next: ContactPoint[]): void => setDraft(serializePoints(next));

  return (
    <div className="flex flex-col gap-1.5">
      <RadioGroup
        value={String(primaryIndex)}
        onValueChange={(v) => commit(setPrimaryAt(rows, Number(v)))}
        disabled={disabled}
        className="gap-1.5"
      >
        {rows.map((row, index) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: positional contact rows
            key={index}
            className="flex items-center gap-1"
          >
            <Input
              aria-label={`${kind} ${index + 1}`}
              type={kind === "Email" ? "email" : "tel"}
              maxLength={MAX_LEN[kind]}
              value={row.value}
              disabled={disabled}
              onChange={(e) => commit(setValueAt(rows, index, e.target.value))}
              className="order-2 h-8 min-w-0 flex-1 px-2 py-1"
            />
            {rows.length > 1 && (
              <RadioGroupItem
                value={String(index)}
                aria-label={`Make ${noun} ${index + 1} primary`}
                className="order-1"
              />
            )}
            <button
              type="button"
              aria-label={`Remove ${noun} ${index + 1}`}
              disabled={disabled}
              onClick={() => commit(removePointAt(rows, index))}
              className="order-3 flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 motion-reduce:transition-none"
            >
              <X aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </RadioGroup>
      <button
        type="button"
        disabled={disabled}
        onClick={() => commit(appendPoint(rows))}
        className="self-start text-sm font-semibold text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        + Add {noun}
      </button>
    </div>
  );
}
