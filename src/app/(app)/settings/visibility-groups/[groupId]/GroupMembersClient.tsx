"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Combobox, type ComboboxOption } from "@/components/ui/Combobox";
import { identityErrorMessage } from "@/constants/settingsIdentity";
import { addGroupMemberAction, removeGroupMemberAction } from "@/features/identity/actions/groups";
import { readCsrfToken } from "@/utils/csrfCookie";

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
  groupId: string;
  members: Member[];
  allUsers: AssignableUser[];
}

// Member roster + add/remove for a single visibility group. Mirrors the inline-form
// pattern used by CreateGroupForm/CreateTeamForm: local pending/error state, a server
// action per mutation, router.refresh() to reload the server-loaded roster on success.
export function GroupMembersClient({ groupId, members, allUsers }: Props): React.ReactElement {
  const router = useRouter();
  const [selectedUserId, setSelectedUserId] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const memberIds = new Set(members.map((m) => m.userId));
  const nonMembers = allUsers.filter((u) => !memberIds.has(u.id));

  function handleRemove(userId: string): void {
    setError(null);
    const csrf = readCsrfToken();
    startTransition(async () => {
      const result = await removeGroupMemberAction(csrf, { groupId, userId });
      if (!result.ok) {
        setError(identityErrorMessage(result.error));
        return;
      }
      router.refresh();
    });
  }

  function handleAdd(): void {
    if (selectedUserId === "") return;
    setError(null);
    const csrf = readCsrfToken();
    startTransition(async () => {
      const result = await addGroupMemberAction(csrf, { groupId, userId: selectedUserId });
      if (!result.ok) {
        setError(identityErrorMessage(result.error));
        return;
      }
      setSelectedUserId("");
      router.refresh();
    });
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {members.length === 0 && <li className="text-sm text-gray-500">No members yet.</li>}
        {members.map((m) => (
          <li key={m.userId} className="flex items-center justify-between gap-2 border-b pb-2">
            <span className="text-sm">{m.name}</span>
            <button
              type="button"
              aria-label={`Remove ${m.name}`}
              disabled={isPending}
              onClick={() => handleRemove(m.userId)}
              className="rounded border px-3 py-1 text-sm text-red-600 transition-transform active:not-disabled:scale-[0.96] disabled:opacity-50"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <span className="mb-1 block text-sm font-medium">Add member</span>
          <Combobox
            ariaLabel="Add member"
            value={selectedUserId}
            onChange={setSelectedUserId}
            placeholder="Select a user"
            options={nonMembers.map<ComboboxOption>((u) => ({
              value: u.id,
              label: u.name,
              avatarName: u.name,
              avatarUrl: u.avatarUrl,
            }))}
          />
        </div>
        <button
          type="button"
          disabled={isPending || selectedUserId === ""}
          onClick={handleAdd}
          className="rounded bg-blue-600 px-4 py-1.5 text-sm text-white transition-transform active:not-disabled:scale-[0.96] disabled:opacity-50"
        >
          Add
        </button>
      </div>

      {error !== null && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
