import { redirect } from "next/navigation";
import { PERMISSION_FLAGS } from "@/constants/permissionFlags";
import { createContext } from "@/server/trpc/context";

// Settings home: send admins to Company settings, everyone else to their personal preferences.
export default async function SettingsIndex(): Promise<never> {
  const { actor } = await createContext();
  const isAdmin =
    actor !== null && (actor.type === "admin" || actor.flags.has(PERMISSION_FLAGS.MANAGE));
  redirect(isAdmin ? "/settings/company" : "/settings/profile");
}
