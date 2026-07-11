"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { MultiCombobox } from "@/components/ui/MultiCombobox";
import { Select } from "@/components/ui/Select";
import { IDENTITY_SETTINGS_STRINGS, identityErrorMessage } from "@/constants/settingsIdentity";
import {
  deleteTeamAction,
  setTeamMembersAction,
  updateTeamAction,
} from "@/features/identity/actions/teams";
import { readCsrfToken } from "@/utils/csrfCookie";

const T = IDENTITY_SETTINGS_STRINGS.teamEditor;
const MANAGER_NONE_VALUE = "team:manager:none";

interface Member {
  userId: string;
  name: string;
}
interface AssignableUser {
  id: string;
  name: string;
  avatarUrl: string | null;
}
interface Props {
  teamId: string;
  name: string;
  managerId: string | null;
  members: Member[];
  assignableUsers: AssignableUser[];
}

// View + edit a single team: rename, change manager, and add/remove members (roster pre-loaded).
// Mirrors the visibility-group detail pattern (server-loaded data, local pending/error state, a
// server action per save, router refresh/back on success). Reuses setTeamMembersAction (full
// replace) for membership and the new updateTeamAction for name/manager.
export function TeamEditClient({
  teamId,
  name: initialName,
  managerId: initialManagerId,
  members,
  assignableUsers,
}: Props): React.ReactElement {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [managerId, setManagerId] = useState(initialManagerId ?? "");
  const [memberIds, setMemberIds] = useState<string[]>(members.map((m) => m.userId));
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const managerOptions = [
    { value: MANAGER_NONE_VALUE, label: T.managerNone },
    ...assignableUsers.map((u) => ({ value: u.id, label: u.name })),
  ];
  // Options for the member picker must include any current member who is no longer assignable
  // (e.g. deactivated), so their chip still renders with a name instead of a bare id.
  const memberOptions = useMemo(() => {
    const byId = new Map(assignableUsers.map((u) => [u.id, { value: u.id, label: u.name }]));
    for (const m of members)
      if (!byId.has(m.userId)) byId.set(m.userId, { value: m.userId, label: m.name });
    return [...byId.values()];
  }, [assignableUsers, members]);

  function save(): void {
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    setError(null);
    const csrf = readCsrfToken();
    startTransition(async () => {
      const updated = await updateTeamAction(csrf, {
        teamId,
        name: trimmed,
        managerId: managerId === "" ? null : managerId,
      });
      if (!updated.ok) {
        setError(identityErrorMessage(updated.error));
        return;
      }
      const roster = await setTeamMembersAction(csrf, { teamId, userIds: memberIds });
      if (!roster.ok) {
        setError(identityErrorMessage(roster.error));
        return;
      }
      router.refresh();
    });
  }

  function remove(): void {
    setError(null);
    const csrf = readCsrfToken();
    startTransition(async () => {
      const res = await deleteTeamAction(csrf, { teamId });
      if (!res.ok) {
        setError(identityErrorMessage(res.error));
        return;
      }
      router.push("/settings/teams");
    });
  }

  return (
    <div className="mt-2 flex max-w-2xl flex-col gap-4">
      <input
        aria-label="Team name"
        type="text"
        value={name}
        maxLength={80}
        disabled={isPending}
        onChange={(e) => setName(e.target.value)}
        className="rounded border px-3 py-1.5 text-lg font-semibold"
      />

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

      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">{T.members}</span>
        <p className="text-xs text-gray-500">{T.membersHelp}</p>
        <MultiCombobox
          ariaLabel={T.members}
          values={memberIds}
          onChange={(v) => !isPending && setMemberIds(v)}
          options={memberOptions}
          placeholder="Add members"
        />
      </div>

      {error !== null && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={save}
          className="rounded bg-blue-600 px-4 py-1.5 text-sm text-white transition-transform active:not-disabled:scale-[0.96] disabled:opacity-50"
        >
          {isPending ? "Saving..." : "Save changes"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={remove}
          className="rounded border px-4 py-1.5 text-sm text-red-600 transition-transform active:not-disabled:scale-[0.96] disabled:opacity-50"
        >
          Delete team
        </button>
      </div>
    </div>
  );
}
