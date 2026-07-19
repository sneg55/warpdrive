import type { ReactNode } from "react";
import { STRINGS } from "@/constants/strings";
import { Reveal } from "./Reveal";

const S = STRINGS.landing.faq;

// Answer-first FAQ. Each question is an h3 so it joins the page's heading outline, and each answer
// is a single self-contained paragraph that an AI answer engine can lift verbatim. The same copy
// feeds the FAQPage JSON-LD in structuredData.ts, so the visible text and the schema stay in lockstep.
export function FaqSection(): ReactNode {
  return (
    <section id="faq" className="scroll-mt-14 border-t bg-muted/50 py-24">
      <div className="mx-auto max-w-3xl px-6">
        <h2 className="text-balance text-center text-3xl font-semibold tracking-tight">
          {S.heading}
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-pretty text-center text-muted-foreground">
          {S.sub}
        </p>
        <Reveal>
          <div className="mt-12 space-y-4">
            {S.items.map((item) => (
              <div key={item.q} data-reveal className="rounded-lg border bg-card p-6">
                <h3 className="font-semibold">{item.q}</h3>
                <p className="mt-2 text-pretty text-sm text-muted-foreground">{item.a}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
