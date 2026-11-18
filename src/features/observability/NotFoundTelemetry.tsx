"use client";
import { useEffect, useRef } from "react";
import { capture, currentRoute, whenReady } from "./capture";
import { EVENTS } from "./events";

export function NotFoundTelemetry(): null {
  const sent = useRef(false);
  useEffect(() => {
    return whenReady(() => {
      if (sent.current) return;
      sent.current = true;
      capture(EVENTS.notFound, { route: currentRoute() });
    });
  }, []);
  return null;
}
