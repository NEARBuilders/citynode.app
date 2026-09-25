import { useState } from "react";
import { Button, Card, Field, FieldLabel, Input } from "@/components";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

const ROLE_ITEMS = [
  { label: "Member", value: "member" },
  { label: "Admin", value: "admin" },
];

const NETWORK_ITEMS = [
  { label: "Mainnet", value: "mainnet" },
  { label: "Testnet", value: "testnet" },
];

const NO_TEAM = "";

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
  const [teamId, setTeamId] = useState(NO_TEAM);
  const [nearNetwork, setNearNetwork] = useState<"mainnet" | "testnet">("mainnet");
  const detectedIdentifier = detectInviteIdentifier(identifier);
  const teamItems = [
    { label: "No team", value: NO_TEAM },
    ...teams.map((team) => ({ label: team.name, value: team.id })),
  ];

  return (
    <Card className="flex flex-col gap-4 p-6">
      <div className="text-sm font-medium text-muted-foreground">Invite member</div>
      <form
        className="flex flex-col gap-4"
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
            setTeamId(NO_TEAM);
          } catch {}
        }}
      >
        <div className="grid gap-4 md:grid-cols-4">
          <Field className="md:col-span-2">
            <FieldLabel htmlFor="invite-identifier" className="sr-only">
              Email or NEAR account
            </FieldLabel>
            <Input
              id="invite-identifier"
              type="text"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder="email@example.com or alice.near"
              aria-label="Email or NEAR account"
              data-testid="invite-identifier-input"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="invite-role" className="sr-only">
              Role
            </FieldLabel>
            <Select
              value={role}
              items={ROLE_ITEMS}
              onValueChange={(value) => {
                if (value === "admin" || value === "member") setRole(value);
              }}
            >
              <SelectTrigger
                id="invite-role"
                aria-label="Role"
                className="w-full"
                data-testid="invite-role-select"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="invite-team" className="sr-only">
              Team
            </FieldLabel>
            <Select
              value={teamId}
              items={teamItems}
              onValueChange={(value) => setTeamId(value ?? NO_TEAM)}
            >
              <SelectTrigger
                id="invite-team"
                aria-label="Team"
                className="w-full"
                data-testid="invite-team-select"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {teamItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        {detectedIdentifier?.kind === "near" && (
          <Field>
            <FieldLabel htmlFor="invite-network" className="sr-only">
              NEAR network
            </FieldLabel>
            <Select
              value={nearNetwork}
              items={NETWORK_ITEMS}
              onValueChange={(value) => {
                if (value === "mainnet" || value === "testnet") setNearNetwork(value);
              }}
            >
              <SelectTrigger
                id="invite-network"
                aria-label="NEAR network"
                className="w-full"
                data-testid="invite-network-select"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NETWORK_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
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
