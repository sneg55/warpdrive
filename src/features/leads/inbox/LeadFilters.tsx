"use client";
import type React from "react";
import { Checkbox } from "@/components/ui/Checkbox";
import { trpc } from "@/lib/trpc-client";
import type { LeadNextActivityBucket } from "../schemas";
import { POP_ITEM, PopMenu } from "./PopMenu";

// Owner filtering is always server-side: the menu lists real users from identity.assignableUsers
// (ungated) and drives filters.ownerIds by id. No client-name fallback: every user, manager or not,
// filters against the full server-side owner set.
export interface OwnerFilter {
  users: { id: string; name: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
}

const NEXT_ACTIVITY_OPTIONS: { key: LeadNextActivityBucket; label: string }[] = [
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "none", label: "No activity" },
];

const TRIGGER =
  "flex items-center gap-1 rounded-md border bg-card px-2.5 py-1 text-sm hover:bg-accent";

function toggle<T>(list: readonly T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

function OwnerMenu({ owner }: { owner: OwnerFilter }): React.ReactNode {
  const label =
    owner.selected.length === 0
      ? "Everyone"
      : `${owner.selected.length} owner${owner.selected.length === 1 ? "" : "s"}`;
  return (
    <PopMenu triggerLabel="Owner filter" triggerClassName={TRIGGER} trigger={<span>{label}</span>}>
      {() => (
        <div className="max-h-64 overflow-auto">
          <button type="button" className={POP_ITEM} onClick={() => owner.onChange([])}>
            Everyone
          </button>
          {owner.users.map((u) => (
            <div key={u.id} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent">
              <Checkbox
                label={u.name}
                checked={owner.selected.includes(u.id)}
                onCheckedChange={() => owner.onChange(toggle(owner.selected, u.id))}
              />
              <span>{u.name}</span>
            </div>
          ))}
        </div>
      )}
    </PopMenu>
  );
}

export interface LeadFiltersProps {
  labelKeys: string[];
  onLabelKeys: (keys: string[]) => void;
  nextActivity: LeadNextActivityBucket | null;
  onNextActivity: (b: LeadNextActivityBucket | null) => void;
  owner: OwnerFilter;
}

export function LeadFilters({
  labelKeys,
  onLabelKeys,
  nextActivity,
  onNextActivity,
  owner,
}: LeadFiltersProps): React.ReactNode {
  const allLabels = (trpc.labels.listByTarget.useQuery({ target: "lead" }).data ?? []).map(
    (l) => l.name,
  );
  const labelText = labelKeys.length === 0 ? "All labels" : `${labelKeys.length} labels`;
  const naText =
    nextActivity === null
      ? "Next activity"
      : (NEXT_ACTIVITY_OPTIONS.find((o) => o.key === nextActivity)?.label ?? "Next activity");

  return (
    <>
      <PopMenu
        triggerLabel="Label filter"
        triggerClassName={TRIGGER}
        trigger={<span>{labelText}</span>}
      >
        {() => (
          <div>
            <button type="button" className={POP_ITEM} onClick={() => onLabelKeys([])}>
              All labels
            </button>
            {allLabels.map((name) => (
              <div
                key={name}
                className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent"
              >
                <Checkbox
                  label={name}
                  checked={labelKeys.includes(name)}
                  onCheckedChange={() => onLabelKeys(toggle(labelKeys, name))}
                />
                <span>{name}</span>
              </div>
            ))}
          </div>
        )}
      </PopMenu>

      <PopMenu
        triggerLabel="Next-activity filter"
        triggerClassName={TRIGGER}
        trigger={<span>{naText}</span>}
      >
        {(close) => (
          <div>
            <button
              type="button"
              className={POP_ITEM}
              onClick={() => {
                onNextActivity(null);
                close();
              }}
            >
              Any time
            </button>
            {NEXT_ACTIVITY_OPTIONS.map((o) => (
              <button
                key={o.key}
                type="button"
                className={POP_ITEM}
                onClick={() => {
                  onNextActivity(o.key);
                  close();
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
      </PopMenu>

      <OwnerMenu owner={owner} />
    </>
  );
}
