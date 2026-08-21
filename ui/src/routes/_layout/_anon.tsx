import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { sessionQueryOptions } from "@/app";
import { PublicShell, PublicShellFooter } from "@/components/layout/public-shell";

export const Route = createFileRoute("/_layout/_anon")({
  beforeLoad: async ({ context }) => {
    const { queryClient, authClient } = context;
    const initialSession = context.session;
    const session =
      initialSession ??
      queryClient.getQueryData(sessionQueryOptions(authClient, initialSession).queryKey);
    if (session?.user) {
      throw redirect({ to: "/dashboard", search: {} });
    }
  },
  component: AnonLayout,
});

function AnonLayout() {
  const { runtimeConfig } = Route.useRouteContext();

  return (
    <PublicShell runtimeConfig={runtimeConfig} footer={<PublicShellFooter />}>
      <Outlet />
    </PublicShell>
  );
}
