import { useQuery } from "@tanstack/react-query";
import { ClientOnly, createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import builtOn from "@/assets/built_on.png";
import builtOnRev from "@/assets/built_on_rev.png";
import { Splash } from "@/components/splash";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useClientValue } from "@/hooks/use-client";
import { ThemeToggle } from "../components/theme-toggle";
import { UserNav } from "../components/user-nav";
import { sessionQueryOptions } from "../lib/session";

export const Route = createFileRoute("/_layout")({
  component: Layout,
});

const HAS_AUTHENTICATED_KEY = "everything.dev.has-authenticated";

function Layout() {
  const pathname = useClientValue(() => window.location.pathname, "/");
  const { data: session } = useQuery(sessionQueryOptions());
  const isAuthenticated = !!session?.user;
  const isHomepage = pathname === "/";
  const hasAuthenticatedBefore = useClientValue(
    () => localStorage.getItem(HAS_AUTHENTICATED_KEY) === "1",
    false,
  );
  const showSplash = !isAuthenticated && isHomepage && !hasAuthenticatedBefore;
  const [splashVisible, setSplashVisible] = useState(showSplash);

  useEffect(() => {
    if (isAuthenticated) {
      localStorage.setItem(HAS_AUTHENTICATED_KEY, "1");
    }
    if (!showSplash) {
      setSplashVisible(false);
    }
  }, [isAuthenticated, showSplash]);

  return (
    <TooltipProvider>
      <div className="min-h-screen w-full flex bg-background text-foreground">
        {isAuthenticated && (
          <aside className="hidden sm:flex shrink-0 w-16 flex-col items-center border-r border-border bg-card py-4 gap-1.5 overflow-y-auto animate-fade-in">
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  to="/"
                  aria-label="everything.dev home"
                  className="mb-3 flex items-center justify-center w-10 h-10 border-2 border-outset border-[rgb(51,51,51)] dark:border-[rgb(100,100,100)] bg-card shadow-sm transition-shadow duration-200 hover:shadow-md"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="w-5 h-5 text-foreground"
                    aria-label="everything.dev logo"
                  >
                    <title>everything.dev</title>
                    <circle cx="12" cy="12" r="10" />
                  </svg>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">everything.dev</TooltipContent>
            </Tooltip>

            <div className="mt-auto pt-4">
              <ThemeToggle />
            </div>
          </aside>
        )}

        <div className="flex-1 flex flex-col min-w-0">
          <header
            className={`shrink-0 bg-card/50 ${isAuthenticated ? "border-b border-border animate-fade-in" : ""}`}
          >
            <div className="flex items-center justify-between px-4 sm:px-6 h-12">
              {isAuthenticated ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono min-w-0">
                  <Link
                    aria-label="everything.dev home"
                    className="sm:hidden flex items-center justify-center w-8 h-8 border-2 border-outset border-[rgb(51,51,51)] dark:border-[rgb(100,100,100)] bg-card shadow-sm transition-shadow duration-200 hover:shadow-md"
                    to="/"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="w-4 h-4 text-foreground"
                      aria-label="everything.dev logo"
                    >
                      <title>everything.dev</title>
                      <circle cx="12" cy="12" r="10" />
                    </svg>
                  </Link>
                  <div className="hidden sm:flex items-center gap-2">
                    <span>everything.dev</span>
                  </div>
                </div>
              ) : (
                <Link to="/login" className="text-sm font-medium tracking-tight">
                  everything.dev
                </Link>
              )}

              <div className="flex items-center gap-2">
                {!isAuthenticated && (
                  <div className="sm:hidden">
                    <ThemeToggle />
                  </div>
                )}
                <UserNav />
              </div>
            </div>
          </header>

          <main className="flex-1 w-full min-h-0 overflow-auto scroll-smooth">
            <div
              className={`w-full mx-auto px-4 sm:px-6 py-6 sm:py-10 animate-fade-in-up ${isAuthenticated ? "max-w-5xl" : "max-w-4xl"}`}
            >
              <Outlet />
            </div>
          </main>

          <footer className="shrink-0 flex justify-center py-6 pb-20 sm:pb-6">
            <a
              href="https://near.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="relative h-6 w-[100px]"
            >
              <img
                src={builtOn}
                alt="Built on NEAR"
                className="absolute inset-0 h-full w-full object-contain dark:hidden"
              />
              <img
                src={builtOnRev}
                alt="Built on NEAR"
                className="absolute inset-0 hidden h-full w-full object-contain dark:block"
              />
            </a>
          </footer>
        </div>

        <ClientOnly>
          <Splash visible={splashVisible} onDismiss={() => setSplashVisible(false)} />
        </ClientOnly>
      </div>
    </TooltipProvider>
  );
}
