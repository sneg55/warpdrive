import type React from "react";

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
