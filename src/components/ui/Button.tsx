"use client";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-semibold transition-[color,background-color,opacity,scale] duration-150 ease-out disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-[color,background-color,opacity]",
  {
    variants: {
      variant: {
        default:
          "bg-action text-action-foreground hover:opacity-90 disabled:bg-disabled disabled:text-disabled-foreground",
        outline: "border bg-card hover:bg-accent disabled:opacity-50",
        ghost: "hover:bg-accent hover:text-foreground disabled:opacity-50",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:bg-disabled disabled:text-disabled-foreground",
      },
      size: {
        sm: "h-8 px-2.5",
        md: "h-9 px-4",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  static?: boolean;
}

const TAP_SCALE =
  "motion-safe:active:not-disabled:scale-[0.96] motion-reduce:active:not-disabled:opacity-80";

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
