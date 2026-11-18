import type { ReactNode } from "react";
import { ContactsNav } from "./ContactsNav";

export default function ContactsLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className="flex gap-6 p-4">
      <ContactsNav />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
