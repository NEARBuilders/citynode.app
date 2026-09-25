import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { PublicHeader } from "./public-header";

interface PublicShellProps {
  children: ReactNode;
  footer?: ReactNode;
  showConnect?: boolean;
}

export function PublicShell({ children, footer, showConnect = true }: PublicShellProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <PublicHeader showConnect={showConnect} />

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
  return (
    <nav
      aria-label="Footer"
      data-testid="public-footer"
      className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground"
    >
      <Link to="/about" className="hover:text-foreground">
        About
      </Link>
      <Link to="/skill" className="hover:text-foreground">
        Docs for agents
      </Link>
      <a
        href="https://nearbuilders.org"
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-foreground"
      >
        NEARBuilders
      </a>
    </nav>
  );
}
