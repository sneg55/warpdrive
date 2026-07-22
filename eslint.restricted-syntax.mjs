// @ts-check
// no-restricted-syntax selector banks for eslint.config.mjs, split out to keep the main config
// under the file-size limit. CORE applies to all app code; DESIGN_SYSTEM is dropped only inside
// src/components/ui/** (the sanctioned home for these patterns).

// Core no-restricted-syntax bans that apply to all app code.
export const CORE_RESTRICTED_SYNTAX = [
  {
    selector: "ThrowStatement > NewExpression[callee.name='Error']",
    message: "Throw AppError(id, ...) instead of raw Error (src/constants/errorIds.ts).",
  },
  {
    selector: "CallExpression[callee.name='fetch'][arguments.length<2]",
    message: "fetch() must pass { signal } for cancellation (see AbortSignal convention).",
  },
];

// Design-system enforcement (CLAUDE.md "Use the design system, never reinvent"). New code must
// use the shadcn primitives, not hand-roll these surfaces. The 2026-07-05 migration converted all
// prior offenders to DropdownMenu/Dialog, so the ban now applies everywhere (only the shadcn
// wrappers under src/components/ui/** are exempt, since they ARE the sanctioned implementations).
export const DESIGN_SYSTEM_RESTRICTED_SYNTAX = [
  {
    selector: "ImportDeclaration[source.value='@/components/useMenuDismiss']",
    message:
      "Hand-rolled dropdown menus are banned. Use the shadcn DropdownMenu primitive (src/components/ui/dropdown-menu.tsx) instead of useMenuDismiss.",
  },
  {
    selector: "Literal[value=/fixed inset-0/]",
    message:
      "Hand-rolled modal overlays are banned. Use the shadcn Dialog primitive (src/components/ui/dialog.tsx) instead of a `fixed inset-0` overlay.",
  },
  {
    // Hand-rolled tab strips: any role="tablist"/"tab" written in JSX. Radix supplies these
    // roles at runtime, so the sanctioned Tabs primitive never trips this.
    selector: "JSXAttribute[name.name='role'][value.value=/^tab(list)?$/]",
    message:
      'Hand-rolled tabs are banned. Use the Tabs primitive (src/components/ui/tabs.tsx) instead of role="tablist"/"tab".',
  },
  {
    // Native `title` tooltips on host elements. <iframe title> is exempt (a required a11y name),
    // and `title` props on Capitalized components are not host attributes so they never match.
    selector:
      "JSXOpeningElement[name.name=/^[a-z]/]:not([name.name='iframe']) > JSXAttribute[name.name='title']",
    message:
      "Native `title` tooltips are banned. Use the Tip/Tooltip primitive (src/components/ui/tooltip.tsx). (<iframe title> is exempt.)",
  },
];
