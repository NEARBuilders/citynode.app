import type { Passkey, SessionData } from "@/app";

export type WorkspaceIdentityProfile = {
  hasEmail: boolean;
  hasNear: boolean;
  hasPasskeys: boolean;
  isAdmin: boolean;
  isAnonymous: boolean;
};

export type WorkspaceIdentityProps = {
  nearAccountId: string | null;
  passkeys: Passkey[];
  profile: WorkspaceIdentityProfile;
  tenantMember: boolean;
  user: SessionData["user"] | undefined;
};
