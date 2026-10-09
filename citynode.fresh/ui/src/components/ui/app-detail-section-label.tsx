import type { ReactNode } from "react";

export function AppDetailSectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border pb-1">
      {children}
    </div>
  );
}
