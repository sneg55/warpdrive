"use client";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  // C1 (Pipedrive parity): button/link weight bumped 500 -> 600 (font-medium -> font-semibold).
  "inline-flex items-center justify-center gap-1.5 rounded-md text-sm font-semibold transition-[color,background-color,opacity,scale] duration-150 ease-out disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:opacity-90",
        outline: "border bg-card hover:bg-accent",
        ghost: "hover:bg-accent hover:text-foreground",
      },
      size: {
        sm: "h-8 px-2.5",
        md: "h-9 px-4",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  // Disables the tactile scale-on-press feedback when the motion would be distracting
  // (e.g. large full-width or toolbar buttons that fire on every interaction).
  static?: boolean;
}

// Subtle press feedback; 0.96 is the smallest value that still reads as tactile rather than
// exaggerated. not-disabled so a disabled button doesn't appear to react to clicks.
const TAP_SCALE = "active:not-disabled:scale-[0.96]";

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type, static: isStatic, ...props }, ref) => (
    <button
      ref={ref}
      type={type ?? "button"}
      className={cn(buttonVariants({ variant, size }), isStatic !== true && TAP_SCALE, className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";
