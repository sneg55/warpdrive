"use client";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

interface CodeLine {
  readonly text: string;
  readonly comment: string | null;
}

interface TypeTerminalProps {
  lines: readonly CodeLine[];
}

const CHAR_MS = 30;
const LINE_PAUSE_MS = 400;

// The self-host command block. SSRs the full lines (no-JS and screen readers always get
// the complete text); once the block nears the viewport it replays them as a one-shot
// typing sequence, then rests on the full text again. Reduced motion never starts the
// replay. While typing, the partial render is aria-hidden and an sr-only full copy
// stands in for assistive tech.
export function TypeTerminal({ lines }: TypeTerminalProps): ReactNode {
  const rootRef = useRef<HTMLDivElement>(null);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState(0);

  // Start the replay when the terminal nears the viewport, once.
  useEffect(() => {
    const root = rootRef.current;
    if (root === null || typeof IntersectionObserver === "undefined") return;
    if (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          setTyping(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.1 },
    );
    io.observe(root);
    return () => io.disconnect();
  }, []);

  // Character pump: CHAR_MS per character, LINE_PAUSE_MS breather at each line break.
  useEffect(() => {
    if (!typing) return;
    const boundaries = new Set<number>();
    let total = 0;
    for (const line of lines) {
      total += line.text.length;
      boundaries.add(total);
    }
    let count = 0;
    let timer = 0;
    const tick = () => {
      count += 1;
      setTyped(count);
      if (count < total) {
        timer = window.setTimeout(tick, boundaries.has(count) ? LINE_PAUSE_MS : CHAR_MS);
      }
    };
    timer = window.setTimeout(tick, CHAR_MS);
    return () => window.clearTimeout(timer);
  }, [typing, lines]);

  const total = lines.reduce((n, line) => n + line.text.length, 0);
  const done = typing && typed >= total;

  if (typing && !done) {
    return (
      <div ref={rootRef} className="mt-4 space-y-1.5">
        <span className="sr-only">
          {lines
            .map((line) => `$ ${line.text}${line.comment !== null ? `  # ${line.comment}` : ""}`)
            .join("\n")}
        </span>
        <div aria-hidden="true" className="space-y-1.5">
          {lines.map((line, i) => {
            const start = lines.slice(0, i).reduce((n, l) => n + l.text.length, 0);
            const visible = Math.min(Math.max(typed - start, 0), line.text.length);
            if (visible === 0) return null;
            const lineDone = visible === line.text.length;
            return (
              <p key={line.text}>
                <span className="text-primary-foreground/50">$ </span>
                {line.text.slice(0, visible)}
                {!lineDone && (
                  <span className="ml-0.5 inline-block h-4 w-2 translate-y-0.5 bg-primary-foreground/70" />
                )}
                {lineDone && line.comment !== null && (
                  <span className="text-primary-foreground/50">{`  # ${line.comment}`}</span>
                )}
              </p>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="mt-4 space-y-1.5">
      {lines.map((line) => (
        <p key={line.text}>
          <span className="text-primary-foreground/50">$ </span>
          {line.text}
          {line.comment !== null && (
            <span className="text-primary-foreground/50">{`  # ${line.comment}`}</span>
          )}
        </p>
      ))}
    </div>
  );
}
