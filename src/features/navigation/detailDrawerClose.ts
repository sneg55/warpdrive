"use client";
import { createContext, useContext } from "react";

export const DetailDrawerCloseContext = createContext<(() => void) | null>(null);

export function useDetailDrawerClose(): (() => void) | null {
  return useContext(DetailDrawerCloseContext);
}
