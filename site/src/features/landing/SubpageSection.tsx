import type { ReactNode } from "react";

export function SubpageSection({
  heading,
  summary,
  children,
}: {
  heading: string;
  summary: string;
  children: ReactNode;
}): ReactNode {
  return (
    <section className="mx-auto max-w-4xl px-6 pb-24 pt-20">
      <h1 className="text-balance text-4xl font-semibold tracking-tight">{heading}</h1>
      <p className="mt-5 text-pretty text-lg text-muted-foreground">{summary}</p>
      {children}
    </section>
  );
}
