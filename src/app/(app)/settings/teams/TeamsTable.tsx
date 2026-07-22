import Link from "next/link";
import { STRINGS } from "@/constants/strings";
import {
  SETTINGS_TABLE_CELL,
  SETTINGS_TABLE_HEAD,
  SETTINGS_TABLE_HEADER_CELL,
  SETTINGS_TABLE_ROW,
  SettingsCard,
} from "../SettingsSurface";

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
    <SettingsCard className="shadow-none">
      <table className="w-full text-sm">
        <thead className={SETTINGS_TABLE_HEAD}>
          <tr className="border-b">
            <th className={SETTINGS_TABLE_HEADER_CELL}>{C.name}</th>
            <th className={SETTINGS_TABLE_HEADER_CELL}>{C.manager}</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((t) => (
            <tr key={t.id} className={SETTINGS_TABLE_ROW}>
              <td className={SETTINGS_TABLE_CELL}>
                {/* Row opens the team's edit page (rename, change manager, edit members). */}
                <Link
                  href={`/settings/teams/${t.id}`}
                  className="font-medium text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  {t.name}
                </Link>
              </td>
              <td className={`${SETTINGS_TABLE_CELL} text-muted-foreground`}>
                {t.managerId === null ? V.none : (nameById.get(t.managerId) ?? V.none)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </SettingsCard>
  );
}
