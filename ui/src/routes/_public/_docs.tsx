import { createFileRoute, Outlet } from "@tanstack/react-router";
import { DocsTabs } from "./_docs/-docs-nav";

export const Route = createFileRoute("/_public/_docs")({
  component: DocsLayout,
});

function DocsLayout() {
  return (
    <div className="w-full min-w-0">
      <div className="mx-auto w-full max-w-5xl px-4 pt-6 sm:px-8 sm:pt-8">
        <DocsTabs />
      </div>
      <Outlet />
    </div>
  );
}
