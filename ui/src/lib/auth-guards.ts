import { redirect } from "@tanstack/react-router";
import type { RouterContext, SessionData } from "@/app";
import { sessionQueryOptions } from "@/app";
import { pluginHref, pluginPath } from "./plugin-path";

export interface AuthContext {
  isAuthenticated: boolean;
  user: SessionData["user"] | null;
  session: SessionData["session"] | null;
  activeOrganizationId: string | null;
  isAnonymous: boolean;
  isAdmin: boolean;
  isBanned: boolean;
}

interface GuardArgs {
  context: GuardContext;
  location: { href: string };
}

interface GuardContext extends Omit<RouterContext, "session"> {
  session: RouterContext["session"] | null;
}

async function ensureSession(context: GuardContext): Promise<SessionData | null> {
  const { queryClient, authClient } = context;
  return queryClient.query(sessionQueryOptions(authClient));
}

function buildAuthContext(session: SessionData | null | undefined): AuthContext {
  return {
    isAuthenticated: !!session?.user,
    user: session?.user ?? null,
    session: session?.session ?? null,
    activeOrganizationId: session?.session?.activeOrganizationId ?? null,
    isAnonymous: session?.user?.isAnonymous ?? false,
    isAdmin: session?.user?.role === "admin",
    isBanned: session?.user?.banned ?? false,
  };
}

export async function requireSession({ context, location }: GuardArgs) {
  const session = await ensureSession(context);
  if (!session?.user) {
    throw redirect({ href: pluginHref("/login", { redirect: location.href }) });
  }
  if (session.user.banned) {
    throw redirect({ href: pluginPath("/login#banned") });
  }
  return { auth: buildAuthContext(session), session };
}

export async function requireAdmin(args: GuardArgs) {
  const result = await requireSession(args);
  if (result.session.user?.role !== "admin") {
    throw redirect({ to: "/dashboard" });
  }
  return result;
}
