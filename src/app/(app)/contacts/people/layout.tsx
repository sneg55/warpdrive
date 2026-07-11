import type React from "react";

// Parallel-route layout for the People list: the `modal` slot renders the intercepted person
// slide-over (@modal/(.)[personId]) over the list `children`. When no interception is active the
// slot resolves to @modal/default.tsx (null), so the list renders alone.
export default function PeopleLayout({
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
