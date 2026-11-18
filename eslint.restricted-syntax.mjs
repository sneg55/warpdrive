// @ts-check

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
    selector: "JSXAttribute[name.name='role'][value.value=/^tab(list)?$/]",
    message:
      'Hand-rolled tabs are banned. Use the Tabs primitive (src/components/ui/tabs.tsx) instead of role="tablist"/"tab".',
  },
  {
    selector:
      "JSXOpeningElement[name.name=/^[a-z]/]:not([name.name='iframe']) > JSXAttribute[name.name='title']",
    message:
      "Native `title` tooltips are banned. Use the Tip/Tooltip primitive (src/components/ui/tooltip.tsx). (<iframe title> is exempt.)",
  },
  {
    selector: "JSXOpeningElement[name.name='svg']",
    message:
      "Inline <svg> icons are banned. Use a lucide-react component (it takes the same className), and add the glyph to lucide's set rather than hand-rolling one.",
  },
  {
    selector:
      "CallExpression[callee.object.name='window'][callee.property.name=/^(confirm|alert|prompt)$/]",
    message:
      "Native browser dialogs (window.confirm/alert/prompt) are banned: they render unstyled OS chrome, cannot be themed, and the browser lets users suppress them. Use ConfirmDialog (src/components/ConfirmDialog.tsx) or the shadcn AlertDialog/Dialog primitive.",
  },
];
