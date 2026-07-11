import type React from "react";

// Parallel-route layout for the Leads inbox: the `modal` slot renders the intercepted lead
// slide-over (@modal/(.)[leadId]) over the list `children`, falling back to @modal/default.tsx
// (null) when no interception is active. Mirrors the People / Organizations layouts.
export default function LeadsLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}): React.ReactNode {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
