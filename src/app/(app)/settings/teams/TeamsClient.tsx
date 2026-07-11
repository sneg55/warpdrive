"use client";

import { useRouter } from "next/navigation";
import { CreateTeamForm } from "./CreateTeamForm";

interface User {
  id: string;
  name: string;
}

interface Props {
  users: User[];
}

export function TeamsClient({ users }: Props): React.ReactElement {
  const router = useRouter();
  return <CreateTeamForm users={users} onCreated={() => router.refresh()} />;
}
