import {
  Bot,
  Briefcase,
  Import,
  KanbanSquare,
  Mail,
  ShieldCheck,
  Users,
  Zap,
} from "lucide-react";
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
  bot: Bot,
  import: Import,
} as const;

type Feature = (typeof S.items)[number];

const HIGHLIGHT_ICONS: ReadonlySet<Feature["icon"]> = new Set(S.highlightIcons);
const HIGHLIGHTS = S.items.filter((item) => HIGHLIGHT_ICONS.has(item.icon));
const CORE = S.items.filter((item) => !HIGHLIGHT_ICONS.has(item.icon));

export function FeaturesSection(): ReactNode {
  return (
    <section id="features" className="scroll-mt-14 border-t py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="max-w-2xl">
          <h2 className="text-balance text-3xl font-semibold tracking-tight">{S.heading}</h2>
          <p className="mt-3 text-pretty text-muted-foreground">{S.sub}</p>
        </div>
        <Reveal>
          <div className="mt-12 grid gap-4 lg:grid-cols-2">
            {HIGHLIGHTS.map((item) => {
              const Icon = ICONS[item.icon];
              return (
                <div
                  key={item.title}
                  data-reveal
                  className="rounded-lg border border-link/15 bg-brand-tint p-6"
                >
                  <Icon className="size-5 text-link" aria-hidden="true" />
                  <h3 className="mt-4 text-lg font-semibold">{item.title}</h3>
                  <p className="mt-1.5 max-w-md text-pretty text-sm text-foreground/75">{item.body}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-12 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {CORE.map((item) => {
              const Icon = ICONS[item.icon];
              return (
                <div key={item.title} data-reveal className="border-t pt-5">
                  <h3 className="flex items-center gap-2.5 font-semibold">
                    <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                    {item.title}
                  </h3>
                  <p className="mt-1.5 text-pretty text-sm text-muted-foreground">{item.body}</p>
                </div>
              );
            })}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
