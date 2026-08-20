import { redirect } from "@tanstack/react-router";
import type { RouterContext, SessionData } from "@/app";
import { sessionQueryOptions } from "@/app";

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
  context: RouterContext;
  location: { href: string };
}

async function ensureSession(context: RouterContext): Promise<SessionData> {
  const { queryClient, authClient } = context;
  return queryClient.ensureQueryData(sessionQueryOptions(authClient, context.session));
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
    throw redirect({ to: "/login", search: { redirect: location.href } });
  }
  if (session.user.banned) {
    throw redirect({ to: "/login", hash: "banned" });
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
