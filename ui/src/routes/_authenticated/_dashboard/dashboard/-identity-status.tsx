import type { Passkey, SessionData } from "@/app";
import { Card } from "@/components";
import { InfoRow } from "@/components/ui/info-row";
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
      <div className="text-muted-foreground text-[11px] font-bold uppercase tracking-wider">
        Identity Status
      </div>
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
        <div className="mt-2 rounded-[10px] border border-brand-accent-border bg-brand-accent-light px-4 py-3 text-[13px] leading-relaxed text-foreground">
          Link an email or NEAR wallet before signing out to keep your data.
        </div>
      )}
    </Card>
  );
}
