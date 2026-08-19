import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { sessionQueryOptions } from "@/app";

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
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
        <div className="flex-1 flex flex-col">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
