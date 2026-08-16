import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ChevronDown, ChevronUp, Copy, ExternalLink, Fuel, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { SessionData } from "@/app";
import { sessionQueryOptions, useAuthClient } from "@/app";
import { Badge, Button, Field, FieldLabel, Input } from "@/components";
import { AuthShell } from "@/components/layout/auth-shell";
import { formatYocto, useRelayerFund, useRelayerInfoQuery } from "@/lib/use-relayer-fund";
import { cn } from "@/lib/utils";

interface AuthContext {
  isAuthenticated: boolean;
  user: SessionData["user"] | null;
  session: SessionData["session"] | null;
  activeOrganizationId: string | null;
  isAnonymous: boolean;
  isAdmin: boolean;
  isBanned: boolean;
}

const FUND_PRESETS = ["1", "5", "10"] as const;

export const Route = createFileRoute("/_layout/_admin")({
  beforeLoad: async ({ context, location }) => {
    const { queryClient, authClient } = context;

    const session = await queryClient.ensureQueryData(
      sessionQueryOptions(authClient, context.session),
    );

    if (!session?.user) {
      throw redirect({
        to: "/login",
        search: {
          redirect: location.href,
        },
      });
    }

    if (session.user.banned) {
      throw redirect({
        to: "/login",
        hash: "banned",
      });
    }

    if (session.user.role !== "admin") {
      throw redirect({ to: "/dashboard" });
    }

    const auth: AuthContext = {
      isAuthenticated: true,
      user: session.user,
      session: session.session,
      activeOrganizationId: session.session?.activeOrganizationId || null,
      isAnonymous: session.user.isAnonymous || false,
      isAdmin: session.user.role === "admin",
      isBanned: session.user.banned || false,
    };
    return {
      auth,
      session,
    };
  },
  component: AdminGate,
});

function AdminGate() {
  const { runtimeConfig, session } = Route.useRouteContext();
  return (
    <>
      <AuthShell runtimeConfig={runtimeConfig} session={session} isAdmin={true} />
      <RelayerPanel />
    </>
  );
}

function RelayerPanel() {
  const auth = useAuthClient();
  const queryClient = useQueryClient();
  const nearAccountId = auth.near.getAccountId();
  const infoQuery = useRelayerInfoQuery();
  const info = infoQuery.data;
  const [expanded, setExpanded] = useState(false);

  const fund = useRelayerFund(info, {
    onSuccess: () => {
      infoQuery.refetch();
      queryClient.invalidateQueries({ queryKey: ["relay-history"] });
    },
  });

  const handleConnect = async () => {
    const connected = await auth.near.ensureConnected();
    if (connected) {
      toast.success("Wallet connected");
      infoQuery.refetch();
    } else {
      toast.error("Wallet connection declined");
    }
  };

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Copy failed");
    }
  };

  const statusLabel = !info
    ? "not configured"
    : info.enabled
      ? "active"
      : info.accountId
        ? "needs funding"
        : "initialising";

  const statusVariant =
    !info || info.enabled ? "default" : info.accountId ? "destructive" : "secondary";

  const balance = formatYocto(info?.balance);
  const canExpand = !!info?.accountId;
  const shortAccount = info?.accountId
    ? `${info.accountId.slice(0, 6)}…${info.accountId.slice(-4)}`
    : null;

  return (
    <section
      className={cn("border-t border-border bg-background", infoQuery.isLoading && "opacity-80")}
    >
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 py-4">
        <div className="rounded-[12px] border-2 border-outset border-border-strong bg-card shadow-sm">
          <div className="flex flex-wrap items-center gap-4 p-4">
            <Fuel className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                relayer
              </span>
              <Badge variant={statusVariant}>{statusLabel}</Badge>
              {info?.mode && (
                <Badge variant="outline" className="font-mono text-[10px]">
                  {info.mode}
                </Badge>
              )}
            </div>
            {info?.accountId && (
              <div className="flex items-center gap-1 min-w-0">
                <span className="text-xs font-mono text-foreground truncate" title={info.accountId}>
                  {shortAccount}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="Copy relayer account id"
                  onClick={() => handleCopy(info.accountId!)}
                  className="h-6 w-6 p-0"
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            )}
            {balance && (
              <div className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                {balance}
              </div>
            )}
            <div className="ml-auto flex items-center gap-2">
              <Button asChild variant="ghost" size="sm">
                <Link to="/admin/relayer">
                  <ExternalLink className="h-3 w-3" />
                  manage
                </Link>
              </Button>
              {canExpand && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setExpanded((v) => !v)}
                  aria-expanded={expanded}
                >
                  {expanded ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                  fund
                </Button>
              )}
            </div>
          </div>

          {expanded && canExpand && (
            <div className="border-t border-border p-4 space-y-3">
              {!nearAccountId ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    Connect a NEAR wallet to send NEAR to the relayer account.
                  </p>
                  <Button type="button" variant="outline" size="sm" onClick={handleConnect}>
                    <Wallet className="h-3.5 w-3.5" />
                    connect wallet
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      fund relayer
                    </p>
                    <p className="text-xs text-muted-foreground">
                      sending from{" "}
                      <span className="font-mono text-foreground">{nearAccountId}</span>
                    </p>
                  </div>
                  <Field>
                    <FieldLabel htmlFor="admin-relayer-amount">amount (NEAR)</FieldLabel>
                    <Input
                      id="admin-relayer-amount"
                      type="number"
                      min="0"
                      step="0.1"
                      value={fund.amount}
                      onChange={(e) => fund.setAmount(e.target.value)}
                      disabled={fund.sending}
                      className="max-w-xs"
                    />
                  </Field>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex gap-1">
                      {FUND_PRESETS.map((preset) => (
                        <Button
                          key={preset}
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => fund.setAmount(preset)}
                          disabled={fund.sending}
                        >
                          {preset} NEAR
                        </Button>
                      ))}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={fund.sendFund}
                      disabled={fund.sending || fund.parsedAmount === null}
                      className="ml-auto"
                    >
                      {fund.sending ? "sending…" : "fund relayer"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
