import type { ReactNode } from "react";
import type { ClientRuntimeConfig } from "@/app";
import { NearBranding } from "@/components/layout/near-branding";
import { PublicHeader } from "./public-header";

interface PublicShellProps {
  children: ReactNode;
  footer?: ReactNode;
  showConnect?: boolean;
  runtimeConfig?: Partial<ClientRuntimeConfig>;
}

export function PublicShell({
  children,
  footer,
  showConnect = true,
  runtimeConfig,
}: PublicShellProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <PublicHeader showConnect={showConnect} runtimeConfig={runtimeConfig} />

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
