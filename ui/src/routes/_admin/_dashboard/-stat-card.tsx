import type { ReactNode } from "react";

export function StatCard({
  label,
  value,
  mono,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4">
      <div className="text-sm font-medium text-muted-foreground">{label}</div>
      <div
        className={`text-sm text-foreground break-all ${mono ? "font-mono text-xs" : "font-semibold"}`}
      >
        {value}
      </div>
    </div>
  );
}
