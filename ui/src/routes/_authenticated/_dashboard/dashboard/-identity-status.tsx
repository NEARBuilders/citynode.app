import type { Passkey, SessionData } from "@/app";
import { Card } from "@/components";
import { InfoRow } from "@/components/info-row";
import type { WorkspaceIdentityProfile } from "./-workspace-identity-types";

export function IdentityStatus({
  nearAccountId,
  passkeys,
  profile,
  user,
}: {
  nearAccountId: string | null;
  passkeys: Passkey[];
  profile: WorkspaceIdentityProfile;
  user: SessionData["user"];
}) {
  return (
    <Card className="space-y-4 p-6">
      <div className="text-muted-foreground text-sm font-medium">Identity Status</div>
      <div className="flex flex-col gap-2">
        <InfoRow label="email" value={profile.hasEmail ? (user.email ?? "linked") : "not linked"} />
        <InfoRow
          label="near"
          value={profile.hasNear ? (nearAccountId ?? "linked") : "not linked"}
          mono
        />
        <InfoRow
          label="passkeys"
          value={profile.hasPasskeys ? `${passkeys.length} registered` : "not linked"}
        />
        <InfoRow
          label="profile"
          value={profile.isAnonymous ? "anonymous session" : "persistent account"}
        />
      </div>
      {profile.isAnonymous && (
        <div className="mt-2 rounded-xl bg-brand-muted px-4 py-3 text-sm leading-relaxed text-foreground">
          Link an email or NEAR wallet before signing out to keep your data.
        </div>
      )}
    </Card>
  );
}
