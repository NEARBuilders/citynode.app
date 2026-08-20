import type { ReactNode } from "react";
import type { ClientRuntimeConfig } from "@/app";
import { NearBranding } from "@/components/layout/near-branding";

interface PublicShellProps {
  runtimeConfig?: Partial<ClientRuntimeConfig>;
  children: ReactNode;
  footer?: ReactNode;
}

export function PublicShell({ children, footer }: PublicShellProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
        <div className="flex-1 flex flex-col">{children}</div>
        {footer && (
          <footer className="shrink-0 flex items-center justify-center py-6">{footer}</footer>
        )}
      </div>
    </div>
  );
}

export function PublicShellFooter() {
  return <NearBranding />;
}
