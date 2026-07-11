import Link from "next/link";
import { STRINGS } from "@/constants/strings";

const C = STRINGS.settings.columns;
const V = STRINGS.settings.values;

interface Team {
  id: string;
  name: string;
  managerId: string | null;
}

interface User {
  id: string;
  name: string;
}

interface Props {
  teams: Team[];
  users: User[];
}

// Pure, synchronous render of the teams table. Resolves each team's managerId to the
// user's display name so the cell never shows a raw UUID.
export function TeamsTable({ teams, users }: Props): React.ReactElement {
  const nameById = new Map(users.map((u) => [u.id, u.name]));
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left">
          <th className="py-2 pr-4">{C.name}</th>
          <th className="py-2">{C.manager}</th>
        </tr>
      </thead>
      <tbody>
        {teams.map((t) => (
          <tr key={t.id} className="border-b hover:bg-muted/50">
            <td className="py-2 pr-4">
              {/* Row opens the team's edit page (rename, change manager, edit members). */}
              <Link href={`/settings/teams/${t.id}`} className="text-blue-600 hover:underline">
                {t.name}
              </Link>
            </td>
            <td className="py-2">
              {t.managerId === null ? V.none : (nameById.get(t.managerId) ?? V.none)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
