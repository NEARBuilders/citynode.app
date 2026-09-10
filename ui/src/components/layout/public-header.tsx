import type { ClientRuntimeConfig } from "@/app";
import { getAppName } from "@/app";
import { UserNav } from "./user-nav";

interface PublicHeaderProps {
  showConnect?: boolean;
  runtimeConfig?: Partial<ClientRuntimeConfig>;
}

export function PublicHeader({ showConnect = true, runtimeConfig }: PublicHeaderProps) {
  const appName = getAppName(runtimeConfig);

  return (
    <header className="shrink-0">
      <div className="flex items-center justify-between gap-2 px-4 sm:px-6 py-3">
        <span
          className="min-w-0 truncate text-sm font-semibold text-foreground"
          data-testid="public-header-app-name"
        >
          {appName}
        </span>
        <UserNav showConnect={showConnect} />
      </div>
    </header>
  );
}
