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
        "inline-flex items-center rounded-[6px] px-2.5 py-0.5 text-[11px] font-semibold border text-foreground",
        accent
          ? "bg-brand-accent-light border-brand-accent-border"
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
