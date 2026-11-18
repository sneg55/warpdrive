import type { ReactNode } from "react";
import { STRINGS } from "@/constants/strings";

export const metadata = { title: STRINGS.settings.notifications };

export default function NotificationSettingsLayout({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return children;
}
