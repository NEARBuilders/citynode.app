import { PingpayOnramp, PingpayOnrampError } from "@pingpay/onramp-sdk";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Landmark, Pencil, Plus, Server, Trash2, Wallet } from "lucide-react";
import { formatAmount } from "near-kit";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  getAccount,
  getActiveRuntime,
  sessionQueryOptions,
  useApiClient,
  useAuthClient,
} from "@/app";
import pingpayLogoDark from "@/assets/brands/pingpay/pingpay-logo-dark.png";
import pingpayLogoLight from "@/assets/brands/pingpay/pingpay-logo-light.png";
import { Badge, Button, Card, Field, FieldLabel, Input } from "@/components";
import { PageContainer } from "@/components/layout/page-container";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const STAKE_GAS = "300000000000000";

type StakeSearch = { city?: string };

export const Route = createFileRoute("/_layout/_authenticated/stake")({
  validateSearch: (search: Record<string, unknown>): StakeSearch => ({
    city: typeof search.city === "string" ? search.city : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Stake | app" },
      { name: "description", content: "Stake NEAR to a city validator pool." },
    ],
  }),
  component: StakePage,
});

function StakePage() {
  const apiClient = useApiClient();
  const auth = useAuthClient();
  const queryClient = useQueryClient();
  const { runtimeConfig } = Route.useRouteContext();
  const { city: cityFromSearch } = Route.useSearch();
  const account = getAccount(runtimeConfig);
  const gatewayId = getActiveRuntime()?.gatewayId ?? "citynode.app";

  const { data: session } = useQuery(sessionQueryOptions(auth, undefined));

  const [nearAccountId, setNearAccountId] = useState<string | null>(() => auth.near.getAccountId());
  const [connectingWallet, setConnectingWallet] = useState(false);

  const handleConnectWallet = async () => {
    setConnectingWallet(true);
    try {
      const connected = await auth.near.ensureConnected();
      if (connected) {
        setNearAccountId(auth.near.getAccountId());
      } else {
        toast.error("Failed to connect wallet");
      }
    } catch {
      toast.error("Failed to connect wallet");
    } finally {
      setConnectingWallet(false);
    }
  };

  const { data: activeMember } = useQuery({
    queryKey: ["active-member"],
    queryFn: async () => {
      const { data } = await auth.organization.getActiveMember();
      return data ?? null;
    },
    enabled: !!session?.session?.activeOrganizationId,
    staleTime: 30 * 1000,
  });

  const [amount, setAmount] = useState("1");
  const [selectedCity, setSelectedCity] = useState<string>(() => cityFromSearch ?? "");
  const [editingPool, setEditingPool] = useState(false);
  const [poolInput, setPoolInput] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTenantId, setNewTenantId] = useState("");
  const [newPool, setNewPool] = useState("");

  const { data: resolvedCityNode } = useQuery({
    queryKey: ["citynode", "resolve", account],
    queryFn: () => apiClient.resolveCityNode({ accountId: account }),
    staleTime: 30 * 1000,
  });

  const { data: allCityNodes = [] } = useQuery({
    queryKey: ["citynodes"],
    queryFn: () => apiClient.listCityNodes(),
    staleTime: 30 * 1000,
  });

  const isTenantSubdomain = !!resolvedCityNode;
  const selectedCityNode =
    resolvedCityNode ?? allCityNodes.find((c) => c.hostname === selectedCity) ?? null;

  const { data: members = [] } = useQuery({
    queryKey: ["org-members", selectedCityNode?.orgId],
    queryFn: async () => {
      if (!selectedCityNode?.orgId) return [];
      const { data, error } = await auth.organization.listMembers({
        query: { organizationId: selectedCityNode.orgId },
      });
      if (error) throw new Error(error.message);
      return (data?.members ?? []) as Array<{ userId: string; role: string }>;
    },
    enabled: !!selectedCityNode?.orgId,
  });

  const { data: totalStaked, isLoading: totalStakedLoading } = useQuery({
    queryKey: ["pool-total-staked", selectedCityNode?.validatorPool],
    queryFn: () =>
      auth.near
        .getNearClient()
        .view<string>(selectedCityNode?.validatorPool as string, "get_total_staked_balance"),
    enabled: !!selectedCityNode?.validatorPool,
    staleTime: 30 * 1000,
    retry: 1,
  });

  const { data: numDelegators, isLoading: numDelegatorsLoading } = useQuery({
    queryKey: ["pool-num-accounts", selectedCityNode?.validatorPool],
    queryFn: () =>
      auth.near
        .getNearClient()
        .view<number>(selectedCityNode?.validatorPool as string, "get_number_of_accounts"),
    enabled: !!selectedCityNode?.validatorPool,
    staleTime: 30 * 1000,
    retry: 1,
  });

  const myRole = members.find((m) => m.userId === session?.user?.id)?.role;
  const activeOrgId = session?.session?.activeOrganizationId;
  const activeOrgRole = activeMember?.role;
  const isActiveOrgAdmin = activeOrgRole === "admin" || activeOrgRole === "owner";
  const isOrgAdmin =
    !!selectedCityNode &&
    selectedCityNode.orgId === activeOrgId &&
    (myRole === "admin" || myRole === "owner");

  const { data: orgTenants = [] } = useQuery({
    queryKey: ["org-tenants", activeOrgId],
    queryFn: () => apiClient.listTenants(),
    enabled: !!activeOrgId && !isTenantSubdomain,
    staleTime: 30 * 1000,
  });

  const tenantAlreadyLinked = new Set(allCityNodes.map((c) => c.tenantId));
  const availableTenants = orgTenants.filter((t) => !tenantAlreadyLinked.has(t.id));

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!newTenantId || !newPool.trim())
        throw new Error("Select a tenant and enter a validator pool.");
      return apiClient.createCityNode({
        tenantId: newTenantId,
        validatorPool: newPool.trim(),
      });
    },
    onSuccess: async () => {
      toast.success("City node created");
      setCreating(false);
      setNewTenantId("");
      setNewPool("");
      await queryClient.invalidateQueries({ queryKey: ["citynodes"] });
    },
    onError: (err: Error) => toast.error(err.message || "Failed to create city node"),
  });

  const parsedYocto = useMemo(() => {
    const value = Number(amount);
    if (!amount || Number.isNaN(value) || value <= 0) return null;
    return BigInt(parseFloat(amount) * 1e24);
  }, [amount]);

  const stakeMutation = useMutation({
    mutationFn: async () => {
      const connected = await auth.near.ensureConnected();
      if (!connected) throw new Error("Connect a NEAR wallet to stake.");
      const signer = auth.near.getAccountId();
      if (!signer) throw new Error("Connect a NEAR wallet to stake.");
      setNearAccountId(signer);
      if (!selectedCityNode) throw new Error("Select a city to stake to.");
      if (!parsedYocto) throw new Error("Enter a valid amount to stake.");
      const near = auth.near.getNearClient();
      const result = await near
        .transaction(signer)
        .functionCall(
          selectedCityNode.validatorPool,
          "deposit_and_stake",
          {},
          { gas: STAKE_GAS, attachedDeposit: parsedYocto },
        )
        .send({ waitUntil: "FINAL" });
      return result;
    },
    onSuccess: (result) => {
      toast.success("Staked", {
        description: result.transaction?.hash ? `tx: ${result.transaction.hash}` : undefined,
      });
    },
    onError: (err: Error) => toast.error(err.message || "Failed to stake"),
  });

  const onrampRef = useRef<PingpayOnramp | null>(null);

  const onrampMutation = useMutation({
    mutationFn: async () => {
      const onramp = new PingpayOnramp({
        destinationAddress: nearAccountId ?? undefined,
        onPopupClose: () => onrampMutation.reset(),
      });
      onrampRef.current = onramp;
      return onramp.initiateOnramp({ chain: "NEAR", asset: "NEAR" });
    },
    onSuccess: (result) => {
      toast.success("Purchase complete", {
        description: `Deposited to ${result.depositAddress}`,
      });
    },
    onError: (err: Error) => {
      if (err instanceof PingpayOnrampError) {
        toast.error(err.message || "Onramp failed");
      } else {
        toast.error("Unexpected error during purchase");
      }
    },
  });

  useEffect(() => {
    return () => onrampRef.current?.close();
  }, []);

  const updatePoolMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCityNode) throw new Error("No city node selected");
      return apiClient.updateCityNode({
        cityNodeId: selectedCityNode.id,
        validatorPool: poolInput.trim(),
      });
    },
    onSuccess: async () => {
      toast.success("Validator pool updated");
      setEditingPool(false);
      await queryClient.invalidateQueries({ queryKey: ["citynode", "resolve", account] });
      await queryClient.invalidateQueries({ queryKey: ["citynodes"] });
    },
    onError: (err: Error) => toast.error(err.message || "Failed to update validator pool"),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCityNode) throw new Error("No city node selected");
      return apiClient.deleteCityNode({ cityNodeId: selectedCityNode.id });
    },
    onSuccess: async () => {
      toast.success("City node deleted");
      setDeleteOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["citynode", "resolve", account] });
      await queryClient.invalidateQueries({ queryKey: ["citynodes"] });
    },
    onError: (err: Error) => toast.error(err.message || "Failed to delete city node"),
  });

  return (
    <PageContainer variant="narrow">
      <div className="space-y-8">
        <header className="space-y-2">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            <Landmark className="h-3 w-3" />
            Stake
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Stake NEAR to a city
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Deposits are staked directly to the city&apos;s validator pool via{" "}
            <code className="font-mono text-xs">deposit_and_stake</code>.
          </p>
        </header>

        {isTenantSubdomain && resolvedCityNode ? (
          <div className="space-y-3">
            <CityNodeCard
              cityNode={resolvedCityNode}
              gatewayId={gatewayId}
              isAdmin={isOrgAdmin}
              memberCount={members.length}
              totalStaked={totalStaked}
              totalStakedLoading={totalStakedLoading}
              numDelegators={numDelegators}
              numDelegatorsLoading={numDelegatorsLoading}
              onEdit={() => {
                setPoolInput(resolvedCityNode.validatorPool);
                setEditingPool(true);
              }}
              onDelete={() => setDeleteOpen(true)}
            />
            {editingPool && (
              <Card className="p-4 space-y-3">
                <Field>
                  <FieldLabel htmlFor="pool-input">Validator pool</FieldLabel>
                  <Input
                    id="pool-input"
                    value={poolInput}
                    onChange={(e) => setPoolInput(e.target.value)}
                    placeholder="city-node-3.pool.near"
                    className="h-9 text-sm font-mono"
                  />
                </Field>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => updatePoolMutation.mutate()}
                    disabled={updatePoolMutation.isPending || !poolInput.trim()}
                  >
                    save pool
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingPool(false)}>
                    cancel
                  </Button>
                </div>
              </Card>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <Field>
              <FieldLabel htmlFor="city-select">City</FieldLabel>
              <select
                id="city-select"
                value={selectedCity}
                onChange={(e) => setSelectedCity(e.target.value)}
                className="h-9 w-full rounded-[8px] border-2 border-border-strong bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Select a city…</option>
                {allCityNodes.map((cityNode) => (
                  <option key={cityNode.id} value={cityNode.hostname}>
                    {cityNode.name} — {cityNode.validatorPool}
                  </option>
                ))}
              </select>
            </Field>
            {selectedCityNode && (
              <CityNodeCard
                cityNode={selectedCityNode}
                gatewayId={gatewayId}
                isAdmin={isOrgAdmin}
                memberCount={members.length}
                totalStaked={totalStaked}
                totalStakedLoading={totalStakedLoading}
                numDelegators={numDelegators}
                numDelegatorsLoading={numDelegatorsLoading}
                onEdit={() => {
                  setPoolInput(selectedCityNode.validatorPool);
                  setEditingPool(true);
                }}
                onDelete={() => setDeleteOpen(true)}
              />
            )}
          </div>
        )}

        {!isTenantSubdomain && isActiveOrgAdmin && (
          <div className="space-y-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCreating((v) => !v)}
              className="w-full"
            >
              <Plus className="h-3.5 w-3.5" />
              {creating ? "cancel" : "create a city node"}
            </Button>
            {creating && (
              <Card className="p-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Link a validator pool to one of your organization&apos;s tenants.
                </p>
                <Field>
                  <FieldLabel htmlFor="tenant-select">Tenant</FieldLabel>
                  <select
                    id="tenant-select"
                    value={newTenantId}
                    onChange={(e) => setNewTenantId(e.target.value)}
                    className="h-9 w-full rounded-[8px] border-2 border-border-strong bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Select a tenant…</option>
                    {availableTenants.map((tenant) => (
                      <option key={tenant.id} value={tenant.id}>
                        {tenant.name} — {tenant.subdomain}.{gatewayId}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="pool-input">Validator pool</FieldLabel>
                  <Input
                    id="pool-input"
                    value={newPool}
                    onChange={(e) => setNewPool(e.target.value)}
                    placeholder="city-node-3.pool.near"
                    className="h-9 text-sm font-mono"
                  />
                </Field>
                <Button
                  size="sm"
                  onClick={() => createMutation.mutate()}
                  disabled={createMutation.isPending || !newTenantId || !newPool.trim()}
                >
                  {createMutation.isPending ? "Creating…" : "create city node"}
                </Button>
                {availableTenants.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No tenants available. Create a tenant first, then link it to a pool.
                  </p>
                )}
              </Card>
            )}
          </div>
        )}

        <Card className="p-6 space-y-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Stake
          </div>
          {!nearAccountId ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                No NEAR wallet linked. Connect one to stake.
              </p>
              <Button variant="outline" onClick={handleConnectWallet} disabled={connectingWallet}>
                {connectingWallet ? "connecting…" : "connect wallet"}
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Wallet className="h-4 w-4" />
                <span className="font-mono text-xs">{nearAccountId}</span>
              </div>
              <Field>
                <FieldLabel htmlFor="amount-input">Amount (NEAR)</FieldLabel>
                <Input
                  id="amount-input"
                  type="number"
                  min="0"
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="h-9 text-sm"
                />
              </Field>
              <Button
                onClick={() => stakeMutation.mutate()}
                disabled={!selectedCityNode || !parsedYocto || stakeMutation.isPending}
                className="w-full"
              >
                {stakeMutation.isPending
                  ? "Staking…"
                  : selectedCityNode
                    ? `Stake ${amount || "0"} NEAR`
                    : "Select a city first"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Staking sends NEAR to the pool contract — your stake stays under your account.
              </p>
            </>
          )}
        </Card>

        <PingOnrampBanner
          disabled={!nearAccountId}
          pending={onrampMutation.isPending}
          onBuy={() => onrampMutation.mutate()}
        />

        {deleteOpen && selectedCityNode && (
          <Card className="p-4 space-y-3 border-destructive/40">
            <p className="text-sm text-foreground">
              Delete city node <span className="font-mono">{selectedCityNode.hostname}</span>? This
              unlinks it from its validator pool.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="destructive"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
              >
                delete
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDeleteOpen(false)}>
                cancel
              </Button>
            </div>
          </Card>
        )}
      </div>
    </PageContainer>
  );
}

const TENANT_STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  pending: "secondary",
  suspended: "destructive",
  pending_deletion: "destructive",
};

function CityNodeCard({
  cityNode,
  gatewayId,
  isAdmin,
  memberCount,
  totalStaked,
  totalStakedLoading,
  numDelegators,
  numDelegatorsLoading,
  onEdit,
  onDelete,
}: {
  cityNode: {
    id: string;
    hostname: string;
    name: string;
    accountId: string;
    validatorPool: string;
    tenantStatus: string;
  };
  gatewayId: string;
  isAdmin: boolean;
  memberCount: number;
  totalStaked: string | undefined;
  totalStakedLoading: boolean;
  numDelegators: number | undefined;
  numDelegatorsLoading: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-foreground text-background shrink-0">
            <Landmark className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-foreground capitalize truncate">
                {cityNode.name}
              </h2>
              <Badge variant={TENANT_STATUS_VARIANT[cityNode.tenantStatus] ?? "outline"}>
                {cityNode.tenantStatus.replace(/_/g, " ")}
              </Badge>
            </div>
            <p className="text-[11px] font-mono text-muted-foreground truncate">
              {cityNode.hostname}.{gatewayId} · {cityNode.accountId}
            </p>
          </div>
        </div>
        {isAdmin && (
          <div className="flex gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
              edit
            </Button>
            <Button size="sm" variant="destructive" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Server className="h-4 w-4 shrink-0" />
        <span className="font-mono text-xs truncate">{cityNode.validatorPool}</span>
      </div>
      <div className="grid grid-cols-3 gap-3 border-t border-border pt-3">
        <StatBlock
          label="Total staked"
          value={
            totalStaked
              ? `${formatAmount(totalStaked, { precision: 0, trimZeros: true })} NEAR`
              : totalStakedLoading
                ? "…"
                : "—"
          }
        />
        <StatBlock label="Delegators" value={numDelegators ?? (numDelegatorsLoading ? "…" : "—")} />
        <StatBlock label="Members" value={memberCount} />
      </div>
    </Card>
  );
}

function StatBlock({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">
        {label}
      </p>
      <p className="text-sm font-semibold text-foreground truncate">{value}</p>
    </div>
  );
}

function PingOnrampBanner({
  disabled,
  pending,
  onBuy,
}: {
  disabled: boolean;
  pending: boolean;
  onBuy: () => void;
}) {
  const button = (
    <button
      type="button"
      onClick={onBuy}
      disabled={disabled || pending}
      aria-label={pending ? "Opening PingPay" : "Buy NEAR with PingPay"}
      className={cn(
        "group inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border-2 px-5 text-sm font-semibold transition-colors",
        "border-[#AF9EF9] bg-white/80 text-[#3D315E] hover:bg-white",
        "dark:border-[#6D5BD0] dark:bg-[#2B2444] dark:text-[#F3EEFF] dark:hover:bg-[#332B54]",
        "shadow-sm hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#AF9EF9]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        (disabled || pending) && "cursor-not-allowed opacity-50 hover:shadow-sm",
      )}
    >
      {pending ? (
        <>
          <span className="size-4 animate-spin rounded-full border-2 border-[#AF9EF9] border-t-[#3D315E] dark:border-t-[#F3EEFF]" />
          Opening…
        </>
      ) : (
        <>
          <span>Buy with</span>
          <span className="relative inline-block h-4 w-[52px]">
            <img
              src={pingpayLogoDark}
              alt="PingPay"
              className="absolute inset-0 h-full w-full object-contain dark:hidden"
            />
            <img
              src={pingpayLogoLight}
              alt="PingPay"
              className="absolute inset-0 hidden h-full w-full object-contain dark:block"
            />
          </span>
        </>
      )}
    </button>
  );

  return (
    <div className="relative overflow-hidden rounded-2xl border-2 border-[#AF9EF9]/50 bg-gradient-to-br from-[#F9F7FF] to-[#EFE9FF] p-5 dark:border-[#6D5BD0]/40 dark:from-[#211C33] dark:to-[#2B2444]">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/70 dark:bg-white/5">
            <Wallet className="h-4 w-4 text-[#6D5BD0] dark:text-[#C9BBFF]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#3D315E] dark:text-[#EDE8FF]">
              Need NEAR to stake?
            </p>
            <p className="text-xs text-[#6B5F94] dark:text-[#B9AEDE]">
              Buy instantly with card, Apple Pay, or bank transfer.
            </p>
          </div>
        </div>
        {disabled ? (
          <Tooltip>
            <TooltipTrigger asChild>{button}</TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              Connect a NEAR wallet to buy NEAR
            </TooltipContent>
          </Tooltip>
        ) : (
          button
        )}
      </div>
    </div>
  );
}
