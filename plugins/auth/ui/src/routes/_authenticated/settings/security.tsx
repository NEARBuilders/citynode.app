import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { type SessionData, sessionQueryOptions, useAuthClient } from "everything-dev/ui/auth";
import { SessionUnavailable } from "./-components/session-unavailable";
import { SecurityTab } from "./-security-tab";

export const Route = createFileRoute("/_authenticated/settings/security")({
  component: SecuritySettings,
});

function SecuritySettings() {
  const auth = useAuthClient();
  const sessionQuery = useQuery<SessionData | null>(sessionQueryOptions(auth));
  const user = sessionQuery.data?.user;

  if (!user) return <SessionUnavailable query={sessionQuery} />;

  return <SecurityTab user={user} />;
}
