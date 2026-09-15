"use client";

import type React from "react";
import { Combobox, type ComboboxOption } from "@/components/ui/Combobox";
import { Tip } from "@/components/ui/tooltip";
import { STRINGS } from "@/constants/strings";
import { fromToken, toToken } from "@/features/stats/ownerScopeToken";
import type { OwnerScope } from "@/types/stats";

export interface OwnerScopeUser {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface OwnerScopeTeam {
  id: string;
  name: string;
}

export function OwnerScopeSelect({
  value,
  onChange,
  canViewOthers,
  users,
  teams,
}: {
  value: OwnerScope;
  onChange: (scope: OwnerScope) => void;
  canViewOthers: boolean;
  users: OwnerScopeUser[];
  teams: OwnerScopeTeam[];
}): React.ReactNode {
  const meOption: ComboboxOption = { value: "me", label: STRINGS.dashboard.ownerMe };
  const options: ComboboxOption[] = canViewOthers
    ? [
        meOption,
        { value: "all", label: STRINGS.dashboard.ownerAll },
        ...teams.map((t) => ({
          value: toToken({ kind: "team", teamId: t.id }),
          label: t.name,
          group: STRINGS.dashboard.ownerGroupTeams,
        })),
        ...users.map((u) => ({
          value: toToken({ kind: "user", userId: u.id }),
          label: u.name,
          avatarName: u.name,
          avatarUrl: u.avatarUrl,
          group: STRINGS.dashboard.ownerGroupPeople,
        })),
      ]
    : [meOption];

  return (
    <Tip
      label={
        canViewOthers
          ? STRINGS.dashboard.ownerScopeTitle
          : STRINGS.dashboard.ownerScopeDisabledTitle
      }
    >
      <Combobox
        ariaLabel={STRINGS.dashboard.ownerScopeLabel}
        triggerClassName="w-52"
        disabled={!canViewOthers}
        value={toToken(value)}
        onChange={(token) => {
          onChange(fromToken(token));
        }}
        options={options}
      />
    </Tip>
  );
}
