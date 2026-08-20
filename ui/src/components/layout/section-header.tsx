import type { ReactNode } from "react";

interface SectionHeaderProps {
  title: ReactNode;
  action?: ReactNode;
}

export function SectionHeader({ title, action }: SectionHeaderProps) {
  return (
    <div className="flex items-end justify-between gap-3">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      {action}
    </div>
  );
}
