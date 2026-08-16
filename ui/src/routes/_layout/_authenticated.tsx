import { createFileRoute, redirect } from "@tanstack/react-router";
import type { SessionData } from "@/app";
import { sessionQueryOptions } from "@/app";
import { AuthShell } from "@/components/layout/auth-shell";

interface AuthContext {
  isAuthenticated: boolean;
  user: SessionData["user"] | null;
  session: SessionData["session"] | null;
  activeOrganizationId: string | null;
  isAnonymous: boolean;
  isAdmin: boolean;
  isBanned: boolean;
}

export const Route = createFileRoute("/_layout/_authenticated")({
  beforeLoad: async ({ context, location }) => {
    const { queryClient, authClient } = context;

    const session = await queryClient.ensureQueryData(
      sessionQueryOptions(authClient, context.session),
    );

    if (!session?.user) {
      throw redirect({
        to: "/login",
        search: {
          redirect: location.href,
        },
      });
    }

    if (session.user.banned) {
      throw redirect({
        to: "/login",
        hash: "banned",
      });
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
  const { runtimeConfig, session } = Route.useRouteContext();
  const isAdmin = session?.user?.role === "admin";
  return <AuthShell runtimeConfig={runtimeConfig} session={session} isAdmin={isAdmin} />;
}
