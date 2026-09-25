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
    <div className="flex gap-2 rounded-md px-2.5 py-1.5">
      <span className="w-20 shrink-0 text-sm font-medium text-muted-foreground">{label}</span>
      <span
        className={`min-w-0 flex-1 text-foreground break-all ${mono ? "font-mono text-xs" : "text-sm"}`}
      >
        {children}
      </span>
    </div>
  );
}
