import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import type { SessionData } from "@/app";
import { sessionQueryOptions } from "@/app";
import { pluginHref, pluginPath } from "@/lib/plugin-path";

interface AuthContext {
  isAuthenticated: boolean;
  user: SessionData["user"] | null;
  session: SessionData["session"] | null;
  activeOrganizationId: string | null;
  isAnonymous: boolean;
  isAdmin: boolean;
  isBanned: boolean;
}

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ context, location }) => {
    const { queryClient, authClient } = context;

    const session = await queryClient.ensureQueryData(
      sessionQueryOptions(authClient, context.session),
    );

    if (!session?.user) {
      throw redirect({
        href: pluginHref("/login", { redirect: location.pathname + location.searchStr }),
      });
    }

    if (session.user.banned) {
      throw redirect({ href: pluginPath("/login#banned") });
    }

    const auth: AuthContext = {
      isAuthenticated: true,
      user: session.user,
      session: session.session,
      activeOrganizationId: session.session?.activeOrganizationId || null,
      isAnonymous: session.user.isAnonymous || false,
      isAdmin: session.user.role === "admin",
      isBanned: session.user.banned || false,
    };
    return {
      auth,
      session,
    };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return <Outlet />;
}
