import * as TogglePrimitive from "@radix-ui/react-toggle";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

const toggleVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all duration-200 ease-out disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2 border-2 border-outset border-border-strong bg-card text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground hover:shadow-md data-[state=on]:border-inset data-[state=on]:shadow-none data-[state=on]:bg-secondary data-[state=on]:text-foreground",
  {
    variants: {
      variant: {
        default: "",
        outline: "bg-background",
      },
      size: {
        default: "h-9 px-3 rounded-[10px]",
        sm: "h-8 px-2.5 text-xs rounded-[8px]",
        lg: "h-10 px-4 rounded-[10px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Toggle({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Toggle, toggleVariants };
