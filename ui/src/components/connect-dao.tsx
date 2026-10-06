import { UsersThreeIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import type { AppMessageId } from "@/i18n/catalogs";
import { useAppTranslation } from "@/i18n/runtime";
import {
  connectDaoAccount,
  disconnectDaoAccount,
  fetchDaoMembership,
  fetchDaoPolicy,
  useDaoAutoRestore,
  useDaoConnection,
} from "@/lib/dao-connect";
import { useNearAccount } from "@/lib/use-near-account";

export type ConnectDaoPurpose =
  | "apply"
  | "tenant-create"
  | "tenant-deploy"
  | "proposal-review"
  | "community-settings";

interface ConnectDaoProps {
  onVerified?: (info: { daoAccountId: string }) => void;
  expectedDaoAccountId?: string | null;
  purpose?: ConnectDaoPurpose;
  variant?: "card" | "plain";
}

type VerificationState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok" }
  | { kind: "dao-ok" }
  | { kind: "not-member" }
  | { kind: "not-sputnik" }
  | { kind: "wrong-account"; expectedAccountId: string }
  | { kind: "error"; message: string };

const purposeCopy: Record<ConnectDaoPurpose | "default", AppMessageId> = {
  default: "dao.purposeConnect",
  apply: "dao.purposeApply",
  "tenant-create": "dao.purposeCreate",
  "tenant-deploy": "dao.purposeDeploy",
  "proposal-review": "dao.purposeReview",
  "community-settings": "dao.purposeSettings",
};

async function handleConnect(authAccountId: string | null) {
  try {
    await connectDaoAccount({ authAccountId: authAccountId ?? undefined });
  } catch {}
}

async function handleDisconnect() {
  await disconnectDaoAccount();
}

export function ConnectDao({
  onVerified,
  expectedDaoAccountId,
  purpose,
  variant = "card",
}: ConnectDaoProps) {
  const t = useAppTranslation();
  const primaryAccountId = useNearAccount();
  useDaoAutoRestore(primaryAccountId);
  const connection = useDaoConnection();
  const [verification, setVerification] = useState<VerificationState>({ kind: "idle" });

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (
        connection.status !== "connected" ||
        !connection.daoAccountId ||
        (purpose !== "proposal-review" && !primaryAccountId)
      ) {
        setVerification({ kind: "idle" });
        return;
      }
      if (expectedDaoAccountId && connection.daoAccountId !== expectedDaoAccountId) {
        setVerification({ kind: "wrong-account", expectedAccountId: expectedDaoAccountId });
        return;
      }
      setVerification({ kind: "loading" });
      try {
        if (purpose === "proposal-review") {
          const policy = await fetchDaoPolicy(connection.daoAccountId);
          if (cancelled) return;
          if (!policy) {
            setVerification({ kind: "not-sputnik" });
            return;
          }
          setVerification({ kind: "dao-ok" });
          onVerified?.({ daoAccountId: connection.daoAccountId });
          return;
        }
        if (!primaryAccountId) return;
        const result = await fetchDaoMembership(connection.daoAccountId, primaryAccountId);
        if (cancelled) return;
        if (!result.isSputnikContract) {
          setVerification({ kind: "not-sputnik" });
          return;
        }
        if (!result.isMember) {
          setVerification({ kind: "not-member" });
          return;
        }
        setVerification({ kind: "ok" });
        onVerified?.({ daoAccountId: connection.daoAccountId });
      } catch (err) {
        if (cancelled) return;
        setVerification({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, [
    connection.status,
    connection.daoAccountId,
    expectedDaoAccountId,
    primaryAccountId,
    purpose,
    onVerified,
  ]);

  const connected = connection.status === "connected" && !!connection.daoAccountId;
  const connecting = connection.status === "connecting";

  return (
    <div className="flex flex-col gap-2" data-testid="dao-connect">
      <Item variant={variant === "card" ? "outline" : "muted"}>
        <ItemMedia variant="icon">
          <UsersThreeIcon />
        </ItemMedia>
        <ItemContent className="min-w-0">
          {connected ? (
            <>
              <ItemTitle data-testid="dao-connect-account">
                <code className="truncate font-mono">{connection.daoAccountId}</code>
              </ItemTitle>
              <VerificationLine
                state={verification}
                primaryAccountId={primaryAccountId}
                purpose={purpose}
              />
            </>
          ) : (
            <>
              <ItemTitle>{t("dao.connect.title")}</ItemTitle>
              <ItemDescription>
                {purpose === "apply"
                  ? t("dao.apply.description")
                  : t(purposeCopy[purpose ?? "default"])}
              </ItemDescription>
            </>
          )}
        </ItemContent>
        <ItemActions>
          {connected ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="dao-connect-disconnect"
              onClick={() => void handleDisconnect()}
            >
              {t("dao.disconnect")}
            </Button>
          ) : (
            <Button
              type="button"
              variant={variant === "plain" ? "default" : "outline"}
              data-testid="dao-connect-button"
              onClick={() => void handleConnect(primaryAccountId)}
              disabled={connecting}
            >
              {connecting && <Spinner />}
              {t(connecting ? "dao.opening" : "dao.connect.action")}
            </Button>
          )}
        </ItemActions>
      </Item>
      {!connected && connection.status === "error" && connection.error && (
        <p role="alert" className="text-sm text-destructive">
          {t("wallet.daoUnavailable")}
        </p>
      )}
    </div>
  );
}

function VerificationLine({
  state,
  primaryAccountId,
  purpose,
}: {
  state: VerificationState;
  primaryAccountId: string | null;
  purpose?: ConnectDaoPurpose;
}) {
  const t = useAppTranslation();
  if (state.kind === "idle") return null;
  if (state.kind === "loading") {
    return (
      <div
        className="flex items-center gap-2 text-sm text-muted-foreground"
        data-testid="dao-connect-status"
      >
        <Spinner />
        {t(purpose === "proposal-review" ? "dao.verification.checking" : "dao.membership.checking")}
      </div>
    );
  }
  if (state.kind === "ok" || state.kind === "dao-ok") {
    return (
      <div className="flex flex-wrap items-center gap-2" data-testid="dao-connect-status">
        <Badge variant="success">
          {t(state.kind === "dao-ok" ? "dao.verification.verified" : "dao.membership.member")}
        </Badge>
        {state.kind === "ok" && primaryAccountId && (
          <span className="truncate text-sm text-muted-foreground">{primaryAccountId}</span>
        )}
      </div>
    );
  }
  const message =
    state.kind === "not-member"
      ? t("dao.membership.notMember", {
          account: primaryAccountId ?? t("dao.membership.account"),
        })
      : state.kind === "not-sputnik"
        ? t("dao.membership.notSputnik")
        : state.kind === "wrong-account"
          ? t("dao.verification.wrongAccount", { account: state.expectedAccountId })
          : t(purpose === "proposal-review" ? "dao.verification.error" : "wallet.membershipError");
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="dao-connect-status">
      <Badge variant="destructive">
        {t(state.kind === "error" ? "dao.membership.failed" : "dao.membership.unverified")}
      </Badge>
      <span className="text-sm text-muted-foreground">{message}</span>
    </div>
  );
}
