import { useState } from "react";
import { Button, Card, Input } from "@/components";

export type InviteRole = "admin" | "member";

export interface InviteMemberValues {
  email: string;
  role: InviteRole;
  teamId?: string;
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
  const email = identifier.trim();

  return (
    <Card className="p-6 space-y-4 hover:shadow-md">
      <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        Invite member
      </div>
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!email) return;
          try {
            await onInvite({ email, role, ...(teamId ? { teamId } : {}) });
            setIdentifier("");
            setTeamId("");
          } catch {}
        }}
      >
        <div className="grid gap-4 md:grid-cols-[1fr_160px_200px]">
          <Input
            type="email"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            placeholder="email@example.com"
            aria-label="Email"
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
        <Button
          type="submit"
          disabled={isPending || !email}
          variant="outline"
          data-testid="invite-submit-button"
        >
          {isPending ? "sending..." : "send invitation"}
        </Button>
      </form>
    </Card>
  );
}
