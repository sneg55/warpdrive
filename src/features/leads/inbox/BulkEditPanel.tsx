"use client";
import type React from "react";
import { BulkActionBar } from "@/components/data-table/BulkActionBar";
import { trpc } from "@/lib/trpc-client";
import type { BulkUpdateLeadsInput } from "../schemas";
import { PopMenu } from "./PopMenu";

type Change = BulkUpdateLeadsInput["change"];

export interface BulkEditPanelProps {
  count: number;
  archived: boolean;
  assignableUsers: { id: string; name: string }[];
  onApply: (change: Change) => void;
  // Distinct callback (not a bulkUpdateLeadsInput.change field): converts the whole selection to
  // deals via bulkConvertLeadsAction. Only rendered in the non-archived inbox view.
  onConvert: () => void;
  converting?: boolean;
  applying?: boolean;
  onClear: () => void;
}

const BTN =
  "rounded-md border px-2.5 py-1 text-sm transition-[background-color,scale] duration-150 ease-out hover:bg-accent active:scale-[0.96] motion-reduce:transition-colors";
const PANEL = "max-h-56 min-w-40 overflow-auto";

function Menu({
  label,
  disabled,
  children,
}: {
  label: string;
  disabled: boolean;
  children: (close: () => void) => React.ReactNode;
}): React.ReactNode {
  return (
    <PopMenu
      trigger={label}
      triggerLabel={label}
      triggerClassName={`${BTN} disabled:opacity-50`}
      panelClassName={PANEL}
      disabled={disabled}
    >
      {children}
    </PopMenu>
  );
}

const ITEM = "block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent";

// Bulk-edit toolbar shown while the selection is non-empty. Each control maps to a single
// bulkUpdateLeadsAction change set (owner / label set-or-clear / archive-restore / delete).
export function BulkEditPanel({
  count,
  archived,
  assignableUsers,
  onApply,
  onConvert,
  converting = false,
  applying = false,
  onClear,
}: BulkEditPanelProps): React.ReactNode {
  const labelNames = (trpc.labels.listByTarget.useQuery({ target: "lead" }).data ?? []).map(
    (l) => l.name,
  );
  return (
    <BulkActionBar count={count} onClear={onClear}>
      {assignableUsers.length > 0 && (
        <Menu label="Change owner" disabled={applying}>
          {(close) =>
            assignableUsers.map((u) => (
              <button
                key={u.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  close();
                  onApply({ ownerId: u.id });
                }}
                className={ITEM}
              >
                {u.name}
              </button>
            ))
          }
        </Menu>
      )}

      <Menu label="Set label" disabled={applying}>
        {(close) => (
          <>
            {labelNames.map((name) => (
              <button
                key={name}
                type="button"
                role="menuitem"
                onClick={() => {
                  close();
                  onApply({ labels: [name] });
                }}
                className={ITEM}
              >
                {name}
              </button>
            ))}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                close();
                onApply({ labels: [] });
              }}
              className={ITEM}
            >
              Clear labels
            </button>
          </>
        )}
      </Menu>

      {!archived && (
        <button
          type="button"
          onClick={onConvert}
          disabled={converting}
          className={`${BTN} disabled:opacity-50`}
        >
          {converting ? "Converting..." : "Convert to deal"}
        </button>
      )}

      <button
        type="button"
        disabled={applying}
        onClick={() => onApply({ archived: !archived })}
        className={`${BTN} disabled:opacity-50`}
      >
        {archived ? "Restore" : "Archive"}
      </button>
      <button
        type="button"
        disabled={applying}
        onClick={() => onApply({ deleted: true })}
        className="rounded-md border border-destructive/40 px-2.5 py-1 text-sm text-destructive transition-[background-color,scale] duration-150 ease-out hover:bg-destructive/10 active:scale-[0.96] disabled:opacity-50 motion-reduce:transition-colors"
      >
        Delete
      </button>
    </BulkActionBar>
  );
}
