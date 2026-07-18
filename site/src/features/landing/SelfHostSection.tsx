import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { STRINGS } from "@/constants/strings";
import { Reveal } from "./Reveal";
import { TypeTerminal } from "./TypeTerminal";

const S = STRINGS.landing.selfHost;

export function SelfHostSection(): ReactNode {
  return (
    <section id="self-host" className="scroll-mt-14 border-t bg-muted/50 py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 lg:grid-cols-2">
        <Reveal>
          <div data-reveal>
            <h2 className="text-balance text-3xl font-semibold tracking-tight">{S.heading}</h2>
            <p className="mt-4 text-pretty text-muted-foreground">{S.body}</p>
            <ul className="mt-6 space-y-3">
              {S.bullets.map((bullet) => (
                <li key={bullet} className="flex gap-2.5 text-sm">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {S.stackLabel}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {S.stack.map((tech) => (
                  <span
                    key={tech}
                    className="rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground"
                  >
                    {tech}
                  </span>
                ))}
              </div>
            </div>
          </div>
          {/* Token-based dark panel: primary is the slate-900 role, no literal colors needed. */}
          <div
            data-reveal
            className="rounded-lg bg-primary p-5 font-mono text-sm text-primary-foreground shadow-[0_1px_2px_rgb(15_23_42/0.08),0_16px_40px_-16px_rgb(15_23_42/0.35)]"
          >
            <div className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-primary-foreground/25" />
              <span className="size-2.5 rounded-full bg-primary-foreground/25" />
              <span className="size-2.5 rounded-full bg-primary-foreground/25" />
              <span className="ml-2 text-xs text-primary-foreground/50">{S.terminalTitle}</span>
            </div>
            <TypeTerminal lines={S.code} />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
