import type { InferClientOutputs } from "@orpc/client";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, ExternalLink } from "lucide-react";
import { useState } from "react";
import type { ApiClient } from "@/app";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatNearBalance,
  formatPoolFee,
  stakePoolStatsQueryOptions,
  stakePoolTopHoldersQueryOptions,
} from "@/lib/queries/stake-pool";

type Validator = InferClientOutputs<ApiClient>["getNodeSummary"]["validators"][number];
type Holder = { accountId: string; stakedBalance: bigint };

function explorerUrl(accountId: string, network: string) {
  return `https://${network === "testnet" ? "testnet." : ""}nearblocks.io/address/${encodeURIComponent(accountId)}`;
}

function metadataUrl(metadata: Validator["metadata"]) {
  for (const value of [metadata.stakeUrl, metadata.explorerUrl]) {
    if (typeof value !== "string") continue;
    try {
      const url = new URL(value);
      if (url.protocol === "https:" || url.protocol === "http:") return url.href;
    } catch {}
  }
  return undefined;
}

export function StakePoolCard({ validator }: { validator: Validator }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const network = validator.network || "mainnet";
  const supported =
    validator.protocol === "near" && (network === "mainnet" || network === "testnet");
  const poolUrl = metadataUrl(validator.metadata);

  async function copyAccount() {
    try {
      await navigator.clipboard.writeText(validator.accountId);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 flex-1 break-all font-mono text-sm font-semibold">
            {validator.accountId}
          </h3>
          <Button
            variant="ghost"
            size="icon"
            aria-label={copyState === "copied" ? "Copied pool account" : "Copy pool account"}
            onClick={copyAccount}
          >
            {copyState === "copied" ? <Check /> : <Copy />}
          </Button>
          {supported && (
            <Button variant="ghost" size="icon" asChild>
              <a
                href={explorerUrl(validator.accountId, network)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="View account on Nearblocks"
              >
                <ExternalLink />
              </a>
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {validator.role} · {validator.protocol} · {network}
        </p>
        {copyState === "error" && (
          <p role="status" className="text-xs text-muted-foreground">
            Could not copy the account. Select the account name to copy it.
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-5">
        {supported ? (
          <NearPoolStats accountId={validator.accountId} network={network} />
        ) : (
          <p className="text-sm text-muted-foreground">
            {validator.protocol !== "near"
              ? `Live stats available on ${validator.protocol} explorer.`
              : `Live stats are unavailable for ${network}.`}
          </p>
        )}
        {poolUrl && (
          <a
            href={poolUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm underline underline-offset-4"
          >
            View pool on explorer
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </CardContent>
    </Card>
  );
}

function NearPoolStats({ accountId, network }: { accountId: string; network: string }) {
  const stats = useQuery(stakePoolStatsQueryOptions({ accountId, network }));
  const holders = useQuery(stakePoolTopHoldersQueryOptions({ accountId, network }));
  const statsData = stats.isError ? undefined : stats.data;
  const holdersData = holders.isError ? undefined : holders.data;

  return (
    <>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Metric
          label="Stake"
          loading={stats.isLoading}
          value={statsData && formatNearBalance(statsData.totalStaked)}
        />
        <Metric
          label="Fee"
          loading={stats.isLoading}
          value={statsData && formatPoolFee(statsData.feeNumerator, statsData.feeDenominator)}
        />
        <Metric
          label="Pool accounts"
          loading={stats.isLoading}
          value={statsData && new Intl.NumberFormat("en-US").format(statsData.stakerCount)}
        />
      </dl>
      <div className="space-y-3">
        <h4 className="text-sm font-medium">Top accounts in this sample</h4>
        {holders.isLoading ? (
          <Skeleton aria-label="Loading pool accounts" className="h-24 w-full" />
        ) : holdersData ? (
          holdersData.length > 0 ? (
            <>
              <p className="text-xs text-muted-foreground">
                {holdersData.length}
                {statsData ? ` of ${statsData.stakerCount}` : ""} pool accounts. First page of up to
                50, sorted by stake; not a global ranking.
              </p>
              <HolderList
                holders={holdersData.slice(0, 5)}
                network={network}
                label="Top accounts in this sample"
              />
              {holdersData.length > 5 && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground">
                    Show {holdersData.length - 5} more{" "}
                    {holdersData.length === 6 ? "account" : "accounts"}
                  </summary>
                  <HolderList
                    holders={holdersData.slice(5)}
                    network={network}
                    label="More pool accounts"
                  />
                </details>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No pool accounts found.</p>
          )
        ) : (
          <p className="text-sm text-muted-foreground">—</p>
        )}
      </div>
      {(stats.isError || holders.isError) && (
        <p className="text-xs text-muted-foreground" role="status">
          Some pool data is unavailable. The RPC request failed or returned unsupported data.
        </p>
      )}
    </>
  );
}

function Metric({
  label,
  loading,
  value,
}: {
  label: string;
  loading: boolean;
  value: string | undefined;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words text-sm font-semibold tabular-nums">
        {loading ? (
          <Skeleton aria-label={`Loading ${label}`} className="h-5 w-24" />
        ) : (
          (value ?? "—")
        )}
      </dd>
    </div>
  );
}

function HolderList({
  holders,
  network,
  label,
}: {
  holders: Holder[];
  network: string;
  label: string;
}) {
  return (
    <ul aria-label={label} className="divide-y divide-border">
      {holders.map((holder) => (
        <li
          key={holder.accountId}
          className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs"
        >
          <a
            className="min-w-0 break-all font-mono underline underline-offset-4"
            href={explorerUrl(holder.accountId, network)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {holder.accountId}
          </a>
          <span className="tabular-nums text-muted-foreground">
            {formatNearBalance(holder.stakedBalance)}
          </span>
        </li>
      ))}
    </ul>
  );
}
