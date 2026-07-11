"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { InviteUserForm } from "./InviteUserForm";
import { UserRowControls } from "./UserRowControls";
import { UserStatusTabs } from "./UserStatusTabs";
import { filterUsersByStatus, type UserStatusFilter } from "./userStatus";

interface UserRow {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  isActive: boolean;
  invitedAt: string | null;
}

interface Props {
  rows: UserRow[];
}

const C = {
  name: "Name",
  email: "Email",
  role: "Role",
  active: "Active",
  actions: "Actions",
} as const;

const V = { admin: "Admin", regular: "Regular", yes: "Yes", no: "No", invited: "Invited" } as const;

export function UsersClient({ rows }: Props): React.ReactElement {
  const router = useRouter();
  const [status, setStatus] = useState<UserStatusFilter>("all");
  const visible = filterUsersByStatus(rows, status);

  return (
    <>
      <InviteUserForm onInvited={() => router.refresh()} />
      <div className="mb-3">
        <UserStatusTabs value={status} onChange={setStatus} />
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2 pr-4">{C.name}</th>
            <th className="py-2 pr-4">{C.email}</th>
            <th className="py-2 pr-4">{C.role}</th>
            <th className="py-2 pr-4">{C.active}</th>
            <th className="py-2">{C.actions}</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((u) => (
            <tr key={u.id} className="border-b">
              <td className="py-2 pr-4">
                {u.name}
                {u.invitedAt !== null && (
                  <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    {V.invited}
                  </span>
                )}
              </td>
              <td className="py-2 pr-4">{u.email}</td>
              <td className="py-2 pr-4">{u.isAdmin ? V.admin : V.regular}</td>
              <td className="py-2 pr-4">{u.isActive ? V.yes : V.no}</td>
              <td className="py-2">
                <UserRowControls
                  userId={u.id}
                  isAdmin={u.isAdmin}
                  isActive={u.isActive}
                  onChanged={() => router.refresh()}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
