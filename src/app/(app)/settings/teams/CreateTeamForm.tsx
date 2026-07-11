"use client";

import { useRef, useState, useTransition } from "react";
import { Checkbox } from "@/components/ui/Checkbox";
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
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
      <div className="flex gap-2">
        <label htmlFor="team-name" className="sr-only">
          Team name
        </label>
        <input
          ref={ref}
          id="team-name"
          type="text"
          required
          maxLength={80}
          placeholder="New team name"
          className="flex-1 rounded border px-3 py-1.5 text-sm"
          disabled={isPending}
        />
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-blue-600 px-4 py-1.5 text-sm text-white transition-transform active:not-disabled:scale-[0.96] disabled:opacity-50"
        >
          {isPending ? "Creating..." : "Create"}
        </button>
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
        <p className="text-xs text-gray-500">{T.membersHelp}</p>
        <div className="flex flex-col gap-1">
          {users.map((u) => (
            <div key={u.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                label={u.name}
                checked={memberIds.includes(u.id)}
                disabled={isPending}
                onCheckedChange={() => toggleMember(u.id)}
              />
              <span>{u.name}</span>
            </div>
          ))}
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
