import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { type SessionData, sessionQueryOptions, useAuthClient } from "@/app";
import { useNearAccount } from "@/lib/use-near-account";
import { EmailMethod } from "./-email-method";
import { NearMethod } from "./-near-method";
import { PasskeysMethod } from "./-passkeys-method";

export const Route = createFileRoute("/_layout/_authenticated/_dashboard/settings/auth-methods")({
  component: AuthMethodsSettings,
});

function AuthMethodsSettings() {
  const auth = useAuthClient();
  const { data: session } = useQuery<SessionData | null>(sessionQueryOptions(auth));
  const user = session?.user;
  const nearAccountId = useNearAccount();

  if (!user) return null;

  return (
    <div className="space-y-4">
      <EmailMethod user={user} />
      <NearMethod nearAccountId={nearAccountId} />
      <PasskeysMethod />
    </div>
  );
}
