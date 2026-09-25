import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ChipProps {
  children: ReactNode;
  accent?: boolean;
  muted?: boolean;
  className?: string;
}

export function Chip({ children, accent, muted, className }: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-medium border text-foreground",
        accent
          ? "bg-brand-muted border-brand"
          : muted
            ? "bg-muted border-border text-muted-foreground"
            : "bg-secondary border-border",
        className,
      )}
    >
      {children}
    </span>
  );
}
