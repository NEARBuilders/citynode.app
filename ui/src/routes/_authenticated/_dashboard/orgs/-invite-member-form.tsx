import { useState } from "react";
import { Button, Field, FieldLabel, Input } from "@/components";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AppTranslator } from "@/i18n/catalogs";
import { useAppTranslation } from "@/i18n/runtime";

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

export function createRoleItems(t: AppTranslator) {
  return [
    { label: t("org.member"), value: "member" },
    { label: t("org.admin"), value: "admin" },
  ];
}

export function createNetworkItems(t: AppTranslator) {
  return [
    { label: t("org.mainnet"), value: "mainnet" },
    { label: t("org.testnet"), value: "testnet" },
  ];
}

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
  const translate = useAppTranslation();
  const NETWORK_ITEMS = createNetworkItems(translate);
  const ROLE_ITEMS = createRoleItems(translate);

  const [identifier, setIdentifier] = useState("");
  const [role, setRole] = useState<InviteRole>("member");
  const [teamId, setTeamId] = useState(NO_TEAM);
  const [nearNetwork, setNearNetwork] = useState<"mainnet" | "testnet">("mainnet");
  const detectedIdentifier = detectInviteIdentifier(identifier);
  const teamItems = [
    { label: translate("org.noTeam"), value: NO_TEAM },
    ...teams.map((team) => ({ label: team.name, value: team.id })),
  ];

  return (
    <form
      className="flex flex-col gap-3"
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
      <div className="flex flex-col gap-2 lg:flex-row">
        <Field className="min-w-0 flex-1">
          <FieldLabel htmlFor="invite-identifier" className="sr-only">
            {translate("org.inviteRecipient")}
          </FieldLabel>
          <Input
            id="invite-identifier"
            type="text"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            placeholder={translate("org.inviteExample")}
            aria-label={translate("org.inviteRecipient")}
            autoComplete="off"
            data-testid="invite-identifier-input"
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Select
            value={role}
            items={ROLE_ITEMS}
            onValueChange={(value) => {
              if (value === "admin" || value === "member") setRole(value);
            }}
          >
            <SelectTrigger
              id="invite-role"
              aria-label={translate("org.role")}
              className="min-w-32 flex-1 lg:flex-none"
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
          {teams.length > 0 && (
            <Select
              value={teamId}
              items={teamItems}
              onValueChange={(value) => setTeamId(value ?? NO_TEAM)}
            >
              <SelectTrigger
                id="invite-team"
                aria-label={translate("org.team")}
                className="min-w-36 flex-1 lg:flex-none"
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
          )}
          {detectedIdentifier?.kind === "near" && (
            <Select
              value={nearNetwork}
              items={NETWORK_ITEMS}
              onValueChange={(value) => {
                if (value === "mainnet" || value === "testnet") setNearNetwork(value);
              }}
            >
              <SelectTrigger
                id="invite-network"
                aria-label={translate("org.network")}
                className="min-w-32 flex-1 lg:flex-none"
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
          )}
          <Button
            type="submit"
            disabled={isPending || !detectedIdentifier}
            className="flex-1 lg:flex-none"
            data-testid="invite-submit-button"
          >
            {isPending ? translate("org.inviting") : translate("org.invite")}
          </Button>
        </div>
      </div>
      <p
        className="text-sm text-muted-foreground"
        aria-live="polite"
        data-testid="invite-identifier-feedback"
      >
        {detectedIdentifier?.kind === "email"
          ? translate("org.emailInviteHint")
          : detectedIdentifier?.kind === "near"
            ? translate("invitation.nearHint", {
                account: detectedIdentifier.value,
                network: nearNetwork,
              })
            : identifier.trim()
              ? translate("org.invalidRecipient")
              : translate("org.inviteHint")}
      </p>
    </form>
  );
}
