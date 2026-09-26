import type { ReactNode } from "react";

interface SectionHeaderProps {
  title: ReactNode;
  action?: ReactNode;
  sectionTestId?: string;
}

export function SectionHeader({ title, action, sectionTestId }: SectionHeaderProps) {
  return (
    <div className="flex items-end justify-between gap-3">
      <h2 className="text-lg font-semibold text-foreground" data-testid={sectionTestId}>
        {title}
      </h2>
      {action}
    </div>
  );
}
