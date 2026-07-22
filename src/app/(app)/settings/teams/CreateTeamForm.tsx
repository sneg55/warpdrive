"use client";

import { UsersRound } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { MultiCombobox } from "@/components/ui/MultiCombobox";
import { Select } from "@/components/ui/Select";
import { IDENTITY_SETTINGS_STRINGS, identityErrorMessage } from "@/constants/settingsIdentity";
import { createTeamAction, setTeamMembersAction } from "@/features/identity/actions/teams";
import { readCsrfToken } from "@/utils/csrfCookie";

const T = IDENTITY_SETTINGS_STRINGS.teamEditor;
const MANAGER_NONE_VALUE = "team:manager:none";

interface User {
  id: string;
  name: string;
}

interface Props {
  users: User[];
  onCreated: () => void;
}

export function CreateTeamForm({ users, onCreated }: Props): React.ReactElement {
  const [name, setName] = useState("");
  const [managerId, setManagerId] = useState<string>(MANAGER_NONE_VALUE);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const managerOptions = [
    { value: MANAGER_NONE_VALUE, label: T.managerNone },
    ...users.map((user) => ({ value: user.id, label: user.name })),
  ];
  const memberOptions = users.map((user) => ({
    value: user.id,
    label: user.name,
    avatarName: user.name,
  }));

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const trimmedName = name.trim();
    if (trimmedName.length === 0) return;
    setError(null);
    const csrf = readCsrfToken();
    startTransition(async () => {
      const created = await createTeamAction(csrf, {
        name: trimmedName,
        managerId: managerId === MANAGER_NONE_VALUE ? null : managerId,
      });
      if (!created.ok) {
        setError(identityErrorMessage(created.error));
        return;
      }
      if (memberIds.length > 0) {
        const members = await setTeamMembersAction(csrf, {
          teamId: created.value.id,
          userIds: memberIds,
        });
        if (!members.ok) {
          setError(identityErrorMessage(members.error));
          return;
        }
      }
      setName("");
      setManagerId(MANAGER_NONE_VALUE);
      setMemberIds([]);
      onCreated();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="overflow-hidden rounded-lg border bg-card shadow-sm">
      <div className="flex items-start gap-3 border-b px-5 py-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-muted-foreground">
          <UsersRound className="size-4" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">{T.createTitle}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{T.createDescription}</p>
        </div>
      </div>

      <div className="space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="team-name" className="text-sm font-medium">
              {T.nameLabel}
            </label>
            <Input
              id="team-name"
              type="text"
              required
              maxLength={80}
              placeholder={T.namePlaceholder}
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={isPending}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{T.manager}</span>
            <Select
              ariaLabel={T.manager}
              value={managerId}
              onChange={(value) => {
                if (!isPending) setManagerId(value);
              }}
              placeholder={T.managerNone}
              options={managerOptions}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5 border-t pt-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <span className="text-sm font-medium">{T.members}</span>
              <p className="text-xs text-muted-foreground">{T.membersHelp}</p>
            </div>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {memberIds.length} selected
            </span>
          </div>
          <MultiCombobox
            ariaLabel={T.members}
            values={memberIds}
            onChange={(values) => {
              if (!isPending) setMemberIds(values);
            }}
            options={memberOptions}
            placeholder={T.membersPlaceholder}
          />
        </div>

        {error !== null && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
      </div>

      <div className="flex justify-end border-t bg-muted/20 px-5 py-3">
        <Button type="submit" disabled={isPending || name.trim().length === 0}>
          {isPending ? T.creating : T.create}
        </Button>
      </div>
    </form>
  );
}
