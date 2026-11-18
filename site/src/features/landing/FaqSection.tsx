import type { ReactNode } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { STRINGS } from "@/constants/strings";

const S = STRINGS.landing.faq;
const [FIRST] = S.items;

export function FaqSection(): ReactNode {
  return (
    <section id="faq" className="scroll-mt-14 border-t py-24">
      <div className="mx-auto grid max-w-6xl gap-12 px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <div>
          <h2 className="text-balance text-3xl font-semibold tracking-tight">{S.heading}</h2>
          <p className="mt-3 text-pretty text-muted-foreground">{S.sub}</p>
        </div>
        <Accordion type="multiple" defaultValue={FIRST === undefined ? [] : [FIRST.q]} className="border-t">
          {S.items.map((item) => (
            <AccordionItem key={item.q} value={item.q}>
              <AccordionTrigger>{item.q}</AccordionTrigger>
              <AccordionContent forceMount>
                <p className="max-w-prose text-pretty text-muted-foreground">{item.a}</p>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
