"use client";

import { useRouter } from "next/navigation";
import { CreateGroupForm } from "./CreateGroupForm";

export function VisibilityGroupsClient(): React.ReactElement {
  const router = useRouter();
  return <CreateGroupForm onCreated={() => router.refresh()} />;
}
