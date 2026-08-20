import type { ComponentType, ReactNode } from "react";

interface PageHeaderProps {
  icon?: ComponentType<{ className?: string }>;
  label?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({
  icon: Icon,
  label,
  title,
  subtitle,
  description,
  actions,
}: PageHeaderProps) {
  return (
    <header className="space-y-2">
      {label && (
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          {Icon && <Icon className="h-3 w-3" />}
          {label}
        </div>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">{title}</h1>
          {subtitle && (
            <div className="text-[11px] font-mono text-muted-foreground">{subtitle}</div>
          )}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {description && (
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
      )}
    </header>
  );
}
