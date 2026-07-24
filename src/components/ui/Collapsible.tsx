"use client";
import * as RadixCollapsible from "@radix-ui/react-collapsible";

// Sanctioned disclosure primitive. Radix owns aria-expanded, keyboard activation, and state
// attributes so callers do not need to recreate disclosure semantics around conditional content.
export const Collapsible = RadixCollapsible.Root;
export const CollapsibleTrigger = RadixCollapsible.Trigger;
export const CollapsibleContent = RadixCollapsible.Content;
