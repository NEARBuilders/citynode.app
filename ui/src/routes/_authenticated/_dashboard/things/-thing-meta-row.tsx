import type { ReactNode } from "react";

export function ThingMetaRow({
  label,
  mono,
  children,
}: {
  label: string;
  mono?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[80px_1fr] gap-2 rounded-[6px] bg-muted/10 px-2.5 py-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className={`text-foreground break-all ${mono ? "font-mono text-xs" : "text-sm"}`}>
        {children}
      </span>
    </div>
  );
}
