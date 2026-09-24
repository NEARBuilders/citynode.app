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

/**
 * The router's context carries the session as `SessionData | null | undefined`
 * (the root route resolves it to null for signed-out visitors), so guards
 * accept the widened session instead of the narrower `RouterContext`.
 */
interface GuardContext extends Omit<RouterContext, "session"> {
  session: RouterContext["session"] | null;
}

interface GuardArgs {
  context: GuardContext;
  location: { href: string };
}

async function ensureSession(context: GuardContext): Promise<SessionData | null> {
  const { queryClient, authClient } = context;
  // query() awaits a refetch when the cached session is stale (e.g. right after
  // sign-in invalidation). ensureQueryData would return the stale signed-out
  // value immediately and redirect, bouncing authed users back to /login until
  // the router trips its redirect limit ("Too many redirects").
  return queryClient.query(sessionQueryOptions(authClient, context.session));
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

export async function rejectAuthed({ context }: GuardArgs) {
  const { queryClient, authClient } = context;
  const initialSession = context.session;
  const session =
    initialSession ??
    queryClient.getQueryData(sessionQueryOptions(authClient, initialSession).queryKey);
  if (session?.user) {
    throw redirect({ to: "/dashboard", search: {} });
  }
}
