import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Landmark } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { z } from "zod";
import { getActiveRuntime, useApiClient, useAuthClient } from "@/app";
import { PageContainer, PageHeader } from "@/components";
import {
  childNodesQueryOptions,
  nodeByIdQueryOptions,
  nodeBySlugQueryOptions,
  stakingValidatorsQueryOptions,
} from "@/lib/queries/nodes";
import { tenantAppsQueryOptions } from "@/lib/queries/tenants";
import { useNearAccount } from "@/lib/use-near-account";
import { StakeForm } from "./-stake-form";
import { useStakeMutation, useStakeWalletConnection } from "./-stake-mutations";
import { StakeNodeContent } from "./-stake-node-content";
import { StakeOnramp } from "./-stake-onramp";

export const Route = createFileRoute("/_layout/_authenticated/_dashboard/stake")({
  validateSearch: z.object({ node: z.string().optional(), nodeId: z.uuid().optional() }),
  head: () => ({
    meta: [
      { title: "Stake | app" },
      { name: "description", content: "Stake NEAR to a city validator pool." },
    ],
  }),
  component: StakePage,
});

type ApiClient = ReturnType<typeof useApiClient>;
type TenantApp = Awaited<ReturnType<ApiClient["listTenantApps"]>>[number];
type Node = Awaited<ReturnType<ApiClient["getNode"]>>;

function getDirectoryNodes(tenantApps: TenantApp[]) {
  return tenantApps.flatMap((app) =>
    app.node
      ? [
          {
            id: app.accountId,
            name: app.name,
            slug: app.node.slug,
            kind: app.node.kind,
            hostname: app.hostname,
          },
        ]
      : [],
  );
}

function getStakeTitle(node: Node | undefined, slug: string | null): ReactNode {
  if (node) return `Stake NEAR to ${node.name}`;
  if (slug) return <span className="capitalize">Stake NEAR to {slug}</span>;
  return "Stake NEAR to a city";
}

function parseStakeAmount(amount: string): bigint | null {
  const value = Number(amount);
  if (!amount || Number.isNaN(value) || value <= 0) return null;
  return BigInt(parseFloat(amount) * 1e24);
}

function hasInheritedValidator(node: Node | undefined, sourceNodeId: string | null | undefined) {
  return !!node && !!sourceNodeId && sourceNodeId !== node.id;
}

function getSlugFromHostname(): string | null {
  if (typeof window === "undefined") return null;
  const host = window.location.hostname;
  if (host === "localhost" || host.includes("localhost")) return null;
  const parts = host.split(".");
  if (parts.length <= 2) return null;
  const slug = parts[0];
  if (slug === "www") return null;
  return slug;
}

function StakePage() {
  const apiClient = useApiClient();
  const auth = useAuthClient();
  const queryClient = useQueryClient();
  const { node: nodeSlug, nodeId: selectedNodeId } = Route.useSearch();
  const slug = nodeSlug ?? getSlugFromHostname();
  const hasNodeSelection = !!selectedNodeId || !!slug;
  const { runtimeConfig } = Route.useRouteContext();
  const gateway = getActiveRuntime(runtimeConfig)?.gatewayId ?? "citynode.app";
  const { data: tenantApps = [], isLoading: directoryLoading } = useQuery({
    ...tenantAppsQueryOptions(apiClient),
    enabled: !hasNodeSelection,
  });
  const directoryNodes = useMemo(() => getDirectoryNodes(tenantApps), [tenantApps]);
  const nearAccountId = useNearAccount();
  const [amount, setAmount] = useState("1");
  const [selectedValidatorId, setSelectedValidatorId] = useState<string | null>(null);
  const { connect: handleConnectWallet, isConnecting: connectingWallet } =
    useStakeWalletConnection(auth);

  const nodeById = useQuery({
    ...nodeByIdQueryOptions(apiClient, selectedNodeId ?? ""),
    enabled: !!selectedNodeId,
  });
  const nodeBySlug = useQuery({
    ...nodeBySlugQueryOptions(apiClient, slug ?? ""),
    enabled: !selectedNodeId && !!slug,
  });
  const { data: node, isLoading: nodeLoading } = selectedNodeId ? nodeById : nodeBySlug;
  const nodeId = node?.id;
  const { data: staking, isLoading: stakingLoading } = useQuery({
    ...stakingValidatorsQueryOptions(apiClient, nodeId ?? ""),
    enabled: !!nodeId,
  });
  const validators = useMemo(() => staking?.validators ?? [], [staking?.validators]);
  const isInherited = hasInheritedValidator(node, staking?.sourceNodeId);
  const { data: sourceNode } = useQuery({
    ...nodeByIdQueryOptions(apiClient, staking?.sourceNodeId ?? ""),
    enabled: isInherited,
  });
  const { data: children = [] } = useQuery({
    ...childNodesQueryOptions(apiClient, nodeId ?? ""),
    enabled: !!nodeId && validators.length === 0,
  });
  const defaultValidator = useMemo(
    () => validators.find((validator) => validator.isDefault) ?? validators[0] ?? null,
    [validators],
  );
  const selectedValidator =
    validators.find((validator) => validator.id === selectedValidatorId) ?? defaultValidator;
  const parsedYocto = useMemo(() => parseStakeAmount(amount), [amount]);

  const stakeMutation = useStakeMutation(auth, queryClient);

  return (
    <PageContainer variant="wide">
      <div className="space-y-8">
        <PageHeader
          icon={Landmark}
          label="Stake"
          title={getStakeTitle(node, slug)}
          description={
            <>
              Deposits are staked directly to the validator pool via{" "}
              <code className="font-mono text-xs">deposit_and_stake</code>.
            </>
          }
        />

        <StakeNodeContent
          childNodes={children}
          directoryLoading={directoryLoading}
          directoryNodes={directoryNodes}
          gateway={gateway}
          hasNodeSelection={hasNodeSelection}
          isInherited={isInherited}
          node={node}
          nodeLoading={nodeLoading}
          onSelectValidator={setSelectedValidatorId}
          selectedValidatorId={selectedValidator?.id ?? null}
          sourceNode={sourceNode}
          stakingLoading={stakingLoading}
          validators={validators}
        />

        <StakeForm
          amount={amount}
          connectingWallet={connectingWallet}
          isPending={stakeMutation.isPending}
          nearAccountId={nearAccountId}
          onAmountChange={setAmount}
          onConnect={() => void handleConnectWallet()}
          onStake={(variables) => stakeMutation.mutate(variables)}
          parsedYocto={parsedYocto}
          validator={selectedValidator}
        />

        <StakeOnramp />
      </div>
    </PageContainer>
  );
}
