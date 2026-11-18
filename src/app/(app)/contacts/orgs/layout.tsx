import type React from "react";

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
