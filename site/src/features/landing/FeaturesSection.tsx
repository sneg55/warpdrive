import { Briefcase, KanbanSquare, Mail, ShieldCheck, Users, Zap } from "lucide-react";
import type { ReactNode } from "react";
import { STRINGS } from "@/constants/strings";
import { Reveal } from "./Reveal";

const S = STRINGS.landing.features;

const ICONS = {
  kanban: KanbanSquare,
  briefcase: Briefcase,
  users: Users,
  mail: Mail,
  zap: Zap,
  shield: ShieldCheck,
} as const;

export function FeaturesSection(): ReactNode {
  return (
    <section id="features" className="scroll-mt-14 border-t py-24">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="text-balance text-center text-3xl font-semibold tracking-tight">
          {S.heading}
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-pretty text-center text-muted-foreground">
          {S.sub}
        </p>
        <Reveal>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {S.items.map((item) => {
              const Icon = ICONS[item.icon];
              return (
                <div key={item.title} data-reveal className="rounded-lg border bg-card p-5">
                  <div className="flex size-9 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                    <Icon className="size-4" aria-hidden="true" />
                  </div>
                  <h3 className="mt-3 font-semibold">{item.title}</h3>
                  <p className="mt-1 text-pretty text-sm text-muted-foreground">{item.body}</p>
                </div>
              );
            })}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
