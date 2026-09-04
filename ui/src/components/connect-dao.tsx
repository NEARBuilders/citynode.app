import { Link2, ShieldCheck, ShieldOff, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Card, CardContent } from "@/components";
import { Spinner } from "@/components/ui/spinner";
import {
  connectDaoAccount,
  disconnectDaoAccount,
  fetchDaoMembership,
  type ParsedDaoMembership,
  useDaoAutoRestore,
  useDaoConnection,
} from "@/lib/dao-connect";
import { useNearAccount } from "@/lib/use-near-account";

interface ConnectDaoProps {
  onVerified?: (info: { daoAccountId: string; membership: ParsedDaoMembership }) => void;
}

type MembershipState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok" }
  | { kind: "not-member" }
  | { kind: "not-sputnik" }
  | { kind: "error"; message: string };

export function ConnectDao({ onVerified }: ConnectDaoProps) {
  useDaoAutoRestore();
  const connection = useDaoConnection();
  const [membership, setMembership] = useState<MembershipState>({ kind: "idle" });
  const primaryAccountId = useNearAccount();

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (connection.status !== "connected" || !connection.daoAccountId || !primaryAccountId) {
        setMembership({ kind: "idle" });
        return;
      }
      setMembership({ kind: "loading" });
      try {
        const result = await fetchDaoMembership(connection.daoAccountId, primaryAccountId);
        if (cancelled) return;
        if (!result.isSputnikContract) {
          setMembership({ kind: "not-sputnik" });
          return;
        }
        if (!result.isMember) {
          setMembership({ kind: "not-member" });
          return;
        }
        setMembership({ kind: "ok" });
        onVerified?.({ daoAccountId: connection.daoAccountId, membership: result });
      } catch (err) {
        if (cancelled) return;
        setMembership({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, [connection.status, connection.daoAccountId, primaryAccountId, onVerified]);

  async function handleConnect() {
    try {
      await connectDaoAccount();
    } catch {}
  }

  async function handleDisconnect() {
    await disconnectDaoAccount();
  }

  if (connection.status === "connected" && connection.daoAccountId) {
    return (
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">connected DAO account</h2>
          </div>
          <div className="flex items-center justify-between gap-4">
            <code className="font-mono text-sm text-foreground">{connection.daoAccountId}</code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleDisconnect()}
            >
              disconnect
            </Button>
          </div>
          <MembershipBadge state={membership} primaryAccountId={primaryAccountId} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">connect your DAO</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Sign in to your DAO account via the Trezu multiplexer. Tenant creation will publish the
          tenant runtime config under your DAO account on the mainnet FastKV registry.
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => void handleConnect()}
            disabled={connection.status === "connecting"}
          >
            {connection.status === "connecting" ? (
              <>
                <Spinner className="mr-2" />
                opening Trezu…
              </>
            ) : (
              "connect via Trezu"
            )}
          </Button>
          {connection.status === "error" && connection.error && (
            <span className="text-xs text-destructive">{connection.error}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface MembershipBadgeProps {
  state: MembershipState;
  primaryAccountId: string | null;
}

function MembershipBadge({ state, primaryAccountId }: MembershipBadgeProps) {
  if (state.kind === "loading") {
    return (
      <p className="text-xs text-muted-foreground flex items-center gap-2">
        <Spinner className="h-3 w-3" />
        verifying membership…
      </p>
    );
  }

  if (state.kind === "ok") {
    return (
      <p className="text-xs text-muted-foreground flex items-center gap-2">
        <ShieldCheck className="h-3 w-3 text-green-500" />
        {primaryAccountId
          ? `${primaryAccountId} is listed in a DAO policy group`
          : "connected account listed in a DAO policy group"}
      </p>
    );
  }

  if (state.kind === "not-member") {
    return (
      <p className="text-xs text-destructive flex items-center gap-2">
        <ShieldOff className="h-3 w-3" />
        your primary NEAR account is not listed in any DAO policy group
      </p>
    );
  }

  if (state.kind === "not-sputnik") {
    return (
      <p className="text-xs text-destructive flex items-center gap-2">
        <ShieldOff className="h-3 w-3" />
        target is not a sputnik-dao contract
      </p>
    );
  }

  if (state.kind === "error") {
    return <p className="text-xs text-destructive">membership check failed: {state.message}</p>;
  }

  return null;
}
