import { CompassIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { UserNav } from "./user-nav";

interface PublicHeaderProps {
  showConnect?: boolean;
}

export function PublicHeader({ showConnect = true }: PublicHeaderProps) {
  return (
    <header className="shrink-0">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <nav aria-label="Main navigation" className="flex w-full items-center gap-5 sm:w-auto">
          <Link to="/" className="text-sm font-semibold tracking-tight">
            CityNode
          </Link>
          <Link
            to="/explore"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <CompassIcon className="size-4" />
            Explore
          </Link>
          <Link
            to="/dashboard/node"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            My community
          </Link>
        </nav>
        <UserNav showConnect={showConnect} />
      </div>
    </header>
  );
}
