import { PingpayOnramp, PingpayOnrampError } from "@pingpay/onramp-sdk";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Globe, Landmark, Wallet } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useApiClient, useAuthClient } from "@/app";
import pingpayLogoDark from "@/assets/brands/pingpay/pingpay-logo-dark.png";
import pingpayLogoLight from "@/assets/brands/pingpay/pingpay-logo-light.png";
import {
  Badge,
  Button,
  Card,
  Field,
  FieldLabel,
  Input,
  PageContainer,
  PageHeader,
} from "@/components";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useNearAccount } from "@/lib/use-near-account";
import { cn } from "@/lib/utils";

const STAKE_GAS = "300000000000000";

type StakeSearch = { node?: string };

export const Route = createFileRoute("/_layout/_authenticated/_dashboard/stake")({
  validateSearch: (search: Record<string, unknown>): StakeSearch => ({
    node: typeof search.node === "string" ? search.node : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Stake | app" },
      { name: "description", content: "Stake NEAR to a city validator pool." },
    ],
  }),
  component: StakePage,
});

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
  const { node: nodeSlug } = Route.useSearch();

  const slug = nodeSlug ?? getSlugFromHostname();

  const nearAccountId = useNearAccount();
  const [connectingWallet, setConnectingWallet] = useState(false);
  const [amount, setAmount] = useState("1");
  const [selectedValidatorId, setSelectedValidatorId] = useState<string | null>(null);

  const handleConnectWallet = async () => {
    setConnectingWallet(true);
    try {
      const connected = await auth.near.ensureConnected();
      if (!connected) {
        toast.error("Failed to connect wallet");
      }
    } catch {
      toast.error("Failed to connect wallet");
    } finally {
      setConnectingWallet(false);
    }
  };

  const { data: node, isLoading: nodeLoading } = useQuery({
    queryKey: ["node", "slug", slug],
    queryFn: () => apiClient.resolveNodeBySlug({ slug: slug as string }),
    enabled: !!slug,
    staleTime: 30 * 1000,
  });

  const nodeId = node?.id;

  const { data: staking, isLoading: stakingLoading } = useQuery({
    queryKey: ["staking-validators", nodeId],
    queryFn: () => apiClient.resolveStakingValidators({ nodeId: nodeId as string }),
    enabled: !!nodeId,
    staleTime: 30 * 1000,
  });

  const validators = staking?.validators ?? [];
  const isInherited = !!node && !!staking?.sourceNodeId && staking.sourceNodeId !== node.id;

  const { data: sourceNode } = useQuery({
    queryKey: ["node", "id", staking?.sourceNodeId],
    queryFn: () => apiClient.getNode({ nodeId: staking?.sourceNodeId as string }),
    enabled: isInherited,
    staleTime: 30 * 1000,
  });

  const { data: children = [] } = useQuery({
    queryKey: ["node", "children", nodeId],
    queryFn: () => apiClient.listChildren({ nodeId: nodeId as string }),
    enabled: !!nodeId && validators.length === 0,
    staleTime: 30 * 1000,
  });

  const defaultValidator = useMemo(
    () => validators.find((v) => v.isDefault) ?? validators[0] ?? null,
    [validators],
  );
  const selectedValidator =
    validators.find((v) => v.id === selectedValidatorId) ?? defaultValidator;

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
      if (!selectedValidator) throw new Error("Select a validator to stake to.");
      if (!parsedYocto) throw new Error("Enter a valid amount to stake.");
      const near = auth.near.getNearClient();
      const result = await near
        .transaction(signer)
        .functionCall(
          selectedValidator.accountId,
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

  return (
    <PageContainer variant="wide">
      <div className="space-y-8">
        <PageHeader
          icon={Landmark}
          label="Stake"
          title={node ? `Stake NEAR to ${node.name}` : "Stake NEAR to a city"}
          description={
            <>
              Deposits are staked directly to the validator pool via{" "}
              <code className="font-mono text-xs">deposit_and_stake</code>.
            </>
          }
        />

        {!slug ? (
          <Card className="p-10 text-center">
            <p className="text-sm text-muted-foreground">
              No node selected. Browse the{" "}
              <Link to="/" className="underline">
                directory
              </Link>{" "}
              and pick a city to stake to.
            </p>
          </Card>
        ) : nodeLoading || stakingLoading ? (
          <StakeSkeleton />
        ) : !node ? (
          <Card className="p-10 text-center">
            <p className="text-sm text-muted-foreground">Node not found.</p>
          </Card>
        ) : validators.length === 0 ? (
          <Card className="p-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              This node doesn&apos;t run a validator — browse child nodes that might.
            </p>
            {children.length > 0 ? (
              <div className="flex flex-col gap-2">
                {children.map((child) => (
                  <Link
                    key={child.id}
                    to="/stake"
                    search={{ node: child.slug }}
                    className="inline-flex h-10 items-center justify-between gap-2 rounded-[8px] border-2 border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    <span className="capitalize">{child.name}</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No child nodes either.</p>
            )}
          </Card>
        ) : (
          <div className="space-y-4">
            {isInherited && sourceNode && (
              <Card className="p-4">
                <p className="text-sm text-muted-foreground">
                  {node.name} doesn&apos;t run its own validator — staking to{" "}
                  <span className="font-semibold text-foreground">{sourceNode.name}</span>
                  &apos;s inherited validator.
                </p>
              </Card>
            )}

            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Validators
              </p>
              {validators.map((validator) => {
                const isSelected = selectedValidator?.id === validator.id;
                const isCommunity = validator.role === "community";
                return (
                  <button
                    key={validator.id}
                    type="button"
                    onClick={() => setSelectedValidatorId(validator.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-[10px] border-2 p-4 text-left transition-colors",
                      isSelected
                        ? "border-foreground bg-card"
                        : "border-border bg-card hover:bg-muted",
                      isCommunity && !isSelected && "opacity-80",
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]",
                        isCommunity
                          ? "bg-muted text-muted-foreground"
                          : "bg-foreground text-background",
                      )}
                    >
                      <Globe className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground truncate">
                          {validator.accountId}
                        </span>
                        {validator.isDefault && (
                          <Badge variant="default" className="text-[10px]">
                            default
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge
                          variant={isCommunity ? "outline" : "secondary"}
                          className="capitalize text-[10px]"
                        >
                          {validator.role}
                        </Badge>
                        {validator.protocol && validator.protocol !== "near" && (
                          <Badge variant="outline" className="text-[10px] font-mono">
                            {validator.protocol}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
                        isSelected
                          ? "border-foreground bg-foreground"
                          : "border-border bg-transparent",
                      )}
                    >
                      {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-background" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {selectedValidator && (
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
                  disabled={!selectedValidator || !parsedYocto || stakeMutation.isPending}
                  className="w-full"
                >
                  {stakeMutation.isPending ? "Staking…" : `Stake ${amount || "0"} NEAR`}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Staking sends NEAR to the pool contract — your stake stays under your account.
                </p>
              </>
            )}
          </Card>
        )}

        <PingOnrampBanner
          disabled={!nearAccountId}
          pending={onrampMutation.isPending}
          onBuy={() => onrampMutation.mutate()}
        />
      </div>
    </PageContainer>
  );
}

function StakeSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-16 w-full rounded-[10px]" />
      <Skeleton className="h-16 w-full rounded-[10px]" />
      <Skeleton className="h-40 w-full rounded-[10px]" />
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
        disabled || pending ? "cursor-not-allowed opacity-50 hover:shadow-sm" : "cursor-pointer",
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
