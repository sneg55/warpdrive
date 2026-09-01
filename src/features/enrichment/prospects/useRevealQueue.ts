"use client";

import { useCallback, useRef, useState } from "react";
import { PROSPECT_REVEAL_CHUNK } from "@/constants/prospectSearch";
import { err, ok, type Result } from "@/types/result";

export type RevealQueueStatus = "idle" | "running" | "done" | "error" | "aborted";

export interface RevealQueue<TProfile, TResult> {
  status: RevealQueueStatus;
  processed: number;
  total: number;
  results: TResult[];
  error: string | null;
  stopping: boolean;
  start: (profiles: readonly TProfile[]) => void;
  abort: () => void;
  reset: () => void;
}

interface RevealQueueOptions<TProfile, TResult> {
  send: (chunk: TProfile[]) => Promise<TResult[]>;
}

interface Run {
  stopped: boolean;
}

function chunksOf<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function settle<T>(work: Promise<T[]>): Promise<Result<T[], string>> {
  try {
    return ok(await work);
  } catch (thrown) {
    return err(thrown instanceof Error ? thrown.message : String(thrown));
  }
}

export function useRevealQueue<TProfile, TResult>({
  send,
}: RevealQueueOptions<TProfile, TResult>): RevealQueue<TProfile, TResult> {
  const [status, setStatus] = useState<RevealQueueStatus>("idle");
  const [processed, setProcessed] = useState(0);
  const [total, setTotal] = useState(0);
  const [results, setResults] = useState<TResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const run = useRef<Run | null>(null);

  const abort = useCallback(() => {
    if (run.current === null) return;
    run.current.stopped = true;
    setStopping(true);
  }, []);

  const reset = useCallback(() => {
    if (run.current !== null) run.current.stopped = true;
    run.current = null;
    setStatus("idle");
    setStopping(false);
    setProcessed(0);
    setTotal(0);
    setResults([]);
    setError(null);
  }, []);

  const start = useCallback(
    (profiles: readonly TProfile[]) => {
      if (run.current !== null) run.current.stopped = true;
      const own: Run = { stopped: false };
      run.current = own;
      setStatus("running");
      setProcessed(0);
      setTotal(profiles.length);
      setResults([]);
      setError(null);
      setStopping(false);

      const current = (): boolean => run.current === own;
      const stopped = (): boolean => own.stopped;

      const loop = async (): Promise<void> => {
        for (const chunk of chunksOf(profiles, PROSPECT_REVEAL_CHUNK)) {
          if (stopped()) break;
          const outcome = await settle(send(chunk));
          if (!current()) return;
          if (outcome.ok) {
            setResults((held) => [...held, ...outcome.value]);
            setProcessed((done) => done + chunk.length);
          } else if (!stopped()) {
            setError(outcome.error);
            setStatus("error");
            return;
          }
          if (stopped()) break;
        }
        if (!current()) return;
        setStopping(false);
        setStatus(stopped() ? "aborted" : "done");
      };

      void loop();
    },
    [send],
  );

  return { status, processed, total, results, error, stopping, start, abort, reset };
}
