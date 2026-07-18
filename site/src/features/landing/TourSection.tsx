import type { StaticImageData } from "next/image";
import type { ReactNode } from "react";
import { STRINGS } from "@/constants/strings";
import contactsShot from "./assets/contacts.png";
import dealShot from "./assets/deal-workspace.png";
import inboxShot from "./assets/inbox.png";
import { Reveal } from "./Reveal";
import { ShotFrame } from "./ShotFrame";

const S = STRINGS.landing.tour;

const SHOTS: Record<(typeof S.items)[number]["image"], StaticImageData> = {
  deal: dealShot,
  inbox: inboxShot,
  contacts: contactsShot,
};

export function TourSection(): ReactNode {
  return (
    <section id="tour" className="scroll-mt-14 border-t bg-muted/50 py-24">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="text-balance text-center text-3xl font-semibold tracking-tight">
          {S.heading}
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-pretty text-center text-muted-foreground">
          {S.sub}
        </p>
        <Reveal>
          <div className="mt-16 space-y-16">
            {S.items.map((item, i) => (
              <div key={item.title} data-reveal className="grid items-center gap-8 lg:grid-cols-2">
                <div className={i % 2 === 1 ? "lg:order-2" : undefined}>
                  <ShotFrame src={SHOTS[item.image]} alt={item.alt} />
                </div>
                <div className={i % 2 === 1 ? "lg:order-1" : undefined}>
                  <h3 className="text-xl font-semibold">{item.title}</h3>
                  <p className="mt-2 max-w-md text-pretty text-muted-foreground">{item.caption}</p>
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
