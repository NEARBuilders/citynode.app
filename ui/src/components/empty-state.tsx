import type { ComponentType, ReactNode } from "react";

interface EmptyStateProps {
  icon?: ComponentType<{ size?: number; className?: string }>;
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div className={`min-h-[55vh] flex flex-col items-center justify-center ${className}`}>
      <div className="max-w-md text-center space-y-6">
        {Icon && (
          <div className="min-h-[40px] flex items-center justify-center">
            <Icon size={40} className="text-muted-foreground" />
          </div>
        )}
        {title && <h2 className="text-base font-semibold text-foreground">{title}</h2>}
        {description && (
          <div className="text-sm text-muted-foreground leading-relaxed min-h-[1.25rem]">
            {description}
          </div>
        )}
        {action && <div className="pt-2">{action}</div>}
      </div>
    </div>
  );
}
