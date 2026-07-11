import type { ReactNode } from "react";
import { STRINGS } from "@/constants/strings";

// The notifications settings page is a client component, so its document title
// lives here (server metadata) instead of on the page module.
export const metadata = { title: STRINGS.settings.notifications };

export default function NotificationSettingsLayout({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return children;
}
