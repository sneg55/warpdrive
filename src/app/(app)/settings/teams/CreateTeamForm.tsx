"use client";

import { useId, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
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
  const ref = useRef<HTMLInputElement>(null);
  // Stable prefix so each member checkbox gets a unique id its name <label htmlFor> can target.
  const memberPrefix = useId();
  const [managerId, setManagerId] = useState<string>("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const managerOptions = [
    { value: MANAGER_NONE_VALUE, label: T.managerNone },
    ...users.map((user) => ({ value: user.id, label: user.name })),
  ];

  function toggleMember(id: string): void {
    setMemberIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const name = ref.current?.value.trim() ?? "";
    if (name.length === 0) return;
    setError(null);
    const csrf = readCsrfToken();
    startTransition(async () => {
      const created = await createTeamAction(csrf, {
        name,
        managerId: managerId === "" ? null : managerId,
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
      if (ref.current !== null) ref.current.value = "";
      setManagerId("");
      setMemberIds([]);
      onCreated();
    });
  }

  return (
    // Constrained to a single readable column: these are short fields, so letting them stretch the
    // full content width (as they used to) read as an unstyled/broken form.
    <form onSubmit={handleSubmit} className="mt-8 flex max-w-md flex-col gap-4">
      <h2 className="text-sm font-semibold">{T.createTitle}</h2>

      <div className="flex flex-col gap-1">
        <label htmlFor="team-name" className="text-sm font-medium">
          {T.nameLabel}
        </label>
        <div className="flex gap-2">
          <Input
            ref={ref}
            id="team-name"
            type="text"
            required
            maxLength={80}
            placeholder={T.namePlaceholder}
            className="min-w-0 flex-1"
            disabled={isPending}
          />
          <Button type="submit" disabled={isPending}>
            {isPending ? T.creating : T.create}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">{T.manager}</span>
        <Select
          ariaLabel={T.manager}
          value={managerId}
          onChange={(value) => {
            if (!isPending) setManagerId(value === MANAGER_NONE_VALUE ? "" : value);
          }}
          placeholder={T.managerNone}
          options={managerOptions}
        />
      </div>

      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-medium">{T.members}</legend>
        <p className="text-xs text-muted-foreground">{T.membersHelp}</p>
        <div className="mt-1 flex flex-col gap-1.5">
          {users.map((u) => {
            const id = `${memberPrefix}-${u.id}`;
            return (
              <div key={u.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  id={id}
                  label={u.name}
                  checked={memberIds.includes(u.id)}
                  disabled={isPending}
                  onCheckedChange={() => toggleMember(u.id)}
                />
                <label htmlFor={id} className="cursor-pointer select-none">
                  {u.name}
                </label>
              </div>
            );
          })}
        </div>
      </fieldset>

      {error !== null && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </form>
  );
}
