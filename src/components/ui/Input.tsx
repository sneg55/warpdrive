import { forwardRef } from "react";
import { cn } from "@/lib/utils";

// shadcn-style Input wrapper. The single-line counterpart to Textarea, and the sanctioned
// replacement for bare <input> across the create/edit forms. The box model (border, radius,
// padding, text size) matches the FIELD_INPUT class those forms already share, so migrating a
// site changes nothing at rest; the primitive only standardizes the parts that had drifted:
// the focus-visible ring, the placeholder color, and the disabled treatment. No background is
// set on purpose (FIELD_INPUT never set one, and --card == --background), so a migrated field
// keeps sitting transparently on whatever surface hosts it. Presentational text entry, so no
// Radix primitive applies; this is the standard wrapper to use instead of a bare <input>.
export const Input = forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "w-full rounded-md border px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
