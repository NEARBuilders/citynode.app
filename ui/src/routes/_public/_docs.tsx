import { createFileRoute, Outlet } from "@tanstack/react-router";
import { DocsMobileNav, DocsSideNav } from "./_docs/-docs-nav";

export const Route = createFileRoute("/_public/_docs")({
  component: DocsLayout,
});

function DocsLayout() {
  return (
    <div className="mx-auto w-full max-w-7xl lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-4 lg:px-8">
      <aside className="hidden lg:sticky lg:top-sticky-offset lg:block lg:self-start lg:py-12">
        <DocsSideNav />
      </aside>
      <div className="px-4 pt-6 sm:px-8 lg:hidden">
        <DocsMobileNav />
      </div>
      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
