import { Link } from "@tanstack/react-router";
import type { ClientRuntimeConfig } from "@/app";
import { getAppName } from "@/app";
import { BrandElement } from "@/components/brand-element";
import { UserNav } from "./user-nav";

interface PublicHeaderProps {
  runtimeConfig?: Partial<ClientRuntimeConfig>;
  showConnect?: boolean;
}

export function PublicHeader({ runtimeConfig, showConnect = true }: PublicHeaderProps) {
  const appName = getAppName(runtimeConfig);

  return (
    <header className="shrink-0">
      <div className="flex items-center justify-between gap-2 px-4 sm:px-6 py-3">
        <Link to="/" aria-label={`${appName} home`} className="shrink-0" preload="intent">
          <BrandElement appName={appName} size="sm" />
        </Link>
        <UserNav showConnect={showConnect} />
      </div>
    </header>
  );
}
