import type { ReactNode } from "react";
import { ContactsNav } from "./ContactsNav";

// Wraps every /contacts/* route with the People / Organizations / Timeline vertical sub-sidebar
// (IA1, Pipedrive Contacts IA). Mirrors the settings layout: a fixed-width left rail beside the
// page content, so the sub-nav is persistent across list and detail routes.
export default function ContactsLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className="flex gap-6 p-4">
      <ContactsNav />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
