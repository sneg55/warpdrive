import { cva, type VariantProps } from "class-variance-authority";
import type React from "react";
import { cn } from "@/lib/utils";

export const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        success: "border-transparent bg-success/15 text-success",
        destructive: "border-transparent bg-destructive/10 text-destructive",
        outline: "bg-transparent text-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.ComponentProps<"span">,
    VariantProps<typeof badgeVariants> {}

// shadcn-style status/metadata primitive. Badges are static labels, so unlike Button they do not
// carry hover or press feedback.
export function Badge({ className, variant, ...props }: BadgeProps): React.ReactNode {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
