"use client";
import { useEffect, useLayoutEffect } from "react";

// useLayoutEffect on the client, useEffect during SSR. A layout mutation that must land before the
// first paint (setting scrollTop, measuring) has to run in the layout phase, but React warns when
// useLayoutEffect is called while rendering on the server, where there is nothing to lay out.
export const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;
