import { useState } from "react";
import { Button, Card, Input } from "@/components";

export type InviteRole = "admin" | "member";

export interface InviteMemberValues {
  email?: string;
  nearAccountId?: string;
  nearNetwork?: "mainnet" | "testnet";
  role: InviteRole;
  teamId?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const IMPLICIT_ACCOUNT_PATTERN = /^[0-9a-f]{64}$/i;
const ETH_IMPLICIT_ACCOUNT_PATTERN = /^0x[0-9a-f]{40}$/i;
const NAMED_ACCOUNT_PATTERN = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/i;

export function detectInviteIdentifier(
  value: string,
): { kind: "email"; value: string } | { kind: "near"; value: string } | null {
  const trimmed = value.trim();
  if (EMAIL_PATTERN.test(trimmed)) return { kind: "email", value: trimmed };

  const normalized = trimmed.toLowerCase();
  if (
    IMPLICIT_ACCOUNT_PATTERN.test(normalized) ||
    ETH_IMPLICIT_ACCOUNT_PATTERN.test(normalized) ||
    (normalized.length >= 2 && normalized.length <= 64 && NAMED_ACCOUNT_PATTERN.test(normalized))
  ) {
    return { kind: "near", value: normalized };
  }

  return null;
}

const selectClassName =
  "w-full px-3 py-2 text-sm bg-card text-foreground border-2 border-inset border-border-strong rounded-[8px] outline-none focus:ring-2 focus:ring-ring";

export function InviteMemberForm({
  isPending,
  onInvite,
  teams,
}: {
  isPending: boolean;
  onInvite: (values: InviteMemberValues) => Promise<unknown>;
  teams: Array<{ id: string; name: string }>;
}) {
  const [identifier, setIdentifier] = useState("");
  const [role, setRole] = useState<InviteRole>("member");
  const [teamId, setTeamId] = useState("");
  const [nearNetwork, setNearNetwork] = useState<"mainnet" | "testnet">("mainnet");
  const detectedIdentifier = detectInviteIdentifier(identifier);

  return (
    <Card className="p-6 space-y-4 hover:shadow-md">
      <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        Invite member
      </div>
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!detectedIdentifier) return;
          try {
            await onInvite({
              ...(detectedIdentifier.kind === "email"
                ? { email: detectedIdentifier.value }
                : { nearAccountId: detectedIdentifier.value, nearNetwork }),
              role,
              ...(teamId ? { teamId } : {}),
            });
            setIdentifier("");
            setTeamId("");
          } catch {}
        }}
      >
        <div className="grid gap-4 md:grid-cols-[1fr_160px_200px]">
          <Input
            type="text"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            placeholder="email@example.com or alice.near"
            aria-label="Email or NEAR account"
            data-testid="invite-identifier-input"
          />
          <select
            aria-label="Role"
            value={role}
            onChange={(event) => setRole(event.target.value as InviteRole)}
            className={selectClassName}
            data-testid="invite-role-select"
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
          <select
            aria-label="Team"
            value={teamId}
            onChange={(event) => setTeamId(event.target.value)}
            className={selectClassName}
            data-testid="invite-team-select"
          >
            <option value="">No team</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </div>
        {detectedIdentifier?.kind === "near" && (
          <select
            aria-label="NEAR network"
            data-testid="invite-network-select"
            className={selectClassName}
            value={nearNetwork}
            onChange={(event) => {
              const value = event.target.value;
              if (value === "mainnet" || value === "testnet") setNearNetwork(value);
            }}
          >
            <option value="mainnet">Mainnet</option>
            <option value="testnet">Testnet</option>
          </select>
        )}
        <div
          className="text-xs text-muted-foreground"
          aria-live="polite"
          data-testid="invite-identifier-feedback"
        >
          {detectedIdentifier?.kind === "email"
            ? "Email invitation: a message will be sent to this address."
            : detectedIdentifier?.kind === "near"
              ? `NEAR invitation: ${detectedIdentifier.value} on ${nearNetwork} will claim this invitation with its wallet.`
              : identifier.trim()
                ? "Enter a valid email address or NEAR account ID."
                : "Invite by email or NEAR account ID."}
        </div>
        <Button
          type="submit"
          disabled={isPending || !detectedIdentifier}
          variant="outline"
          data-testid="invite-submit-button"
        >
          {isPending ? "sending..." : "send invitation"}
        </Button>
      </form>
    </Card>
  );
}
