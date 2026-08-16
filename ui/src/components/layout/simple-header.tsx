import { Link } from "@tanstack/react-router";
import type { ClientRuntimeConfig } from "@/app";
import { getAppName } from "@/app";
import { ThemeToggle } from "@/components/theme-toggle";

interface SimpleHeaderProps {
  runtimeConfig?: Partial<ClientRuntimeConfig>;
  rightSlot?: React.ReactNode;
}

export function SimpleHeader({ runtimeConfig, rightSlot }: SimpleHeaderProps) {
  const appName = getAppName(runtimeConfig);

  return (
    <header className="shrink-0 bg-card/50 border-b border-border transition-all duration-200 overflow-hidden h-12">
      <div className="flex items-center justify-between px-4 sm:px-6 h-12">
        <Link
          to="/"
          aria-label={`${appName} home`}
          className="flex items-center justify-center w-10 h-10 transition-opacity duration-200 hover:opacity-70"
        >
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-5 h-5 text-foreground"
            aria-label={`${appName} logo`}
          >
            <title>{appName}</title>
            <circle cx="12" cy="12" r="10" />
          </svg>
        </Link>

        <div className="flex items-center gap-2">
          <ThemeToggle className="flex items-center justify-center w-8 h-8 rounded-full bg-card border border-border text-muted-foreground hover:text-foreground transition-colors shadow-sm" />
          {rightSlot}
        </div>
      </div>
    </header>
  );
}
