import type React from "react";

// Parallel-route layout for the Organizations list: the `modal` slot renders the intercepted org
// slide-over (@modal/(.)[orgId]) over the list `children`, falling back to @modal/default.tsx (null)
// when no interception is active. Mirrors the People layout.
export default function OrgsLayout({
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
