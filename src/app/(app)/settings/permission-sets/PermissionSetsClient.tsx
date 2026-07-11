"use client";

import { useRouter } from "next/navigation";
import type { PermissionFlagKey } from "@/constants/permissionFlags";
import { CreatePermissionSetForm } from "./CreatePermissionSetForm";
import { FlagEditor } from "./FlagEditor";

interface SetRow {
  id: string;
  name: string;
  flags: Partial<Record<PermissionFlagKey, boolean>>;
}

interface Props {
  sets: SetRow[];
}

export function PermissionSetsClient({ sets }: Props): React.ReactElement {
  const router = useRouter();
  const refresh = (): void => router.refresh();
  return (
    <div>
      <CreatePermissionSetForm onCreated={refresh} />
      {sets.map((s) => (
        <FlagEditor key={s.id} setId={s.id} name={s.name} flags={s.flags} onSaved={refresh} />
      ))}
    </div>
  );
}
