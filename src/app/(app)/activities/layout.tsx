import type React from "react";

// Parallel-route layout for Activities: the `modal` slot renders the intercepted record slide-over
// over the list or calendar `children`, falling back to @modal/default.tsx (null) when no
// interception is active. Mirrors the Organizations and Leads layouts.
export default function ActivitiesLayout({
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
