import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useAuthClient } from "everything-dev/ui/auth";
import { useState } from "react";
import { toast } from "sonner";
import { useApiClient } from "@/app";
import { useIdentity } from "@/components/layout/use-identity";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  buildSpawnHostname,
  gatewayForAccount,
  getSpawnStatus,
  publishTenantConfig,
  type SpawnStatus,
  spawnTenant,
} from "@/lib/spawn";

export const Route = createFileRoute("/_authenticated/spawn")({
  head: () => ({
    meta: [{ title: "Spawn | Fresh" }],
  }),
  component: SpawnPage,
});

const SLUG_REGEX = /^[a-z0-9-]+$/;

interface DeploymentRow {
  id: string;
  name: string;
  accountId: string;
  ownerKind: string;
  deletedAt: string | null;
}

function SpawnPage() {
  const identity = useIdentity();
  const auth = useAuthClient();
  const [walletPending, setWalletPending] = useState(false);

  if (!identity.nearAccountId) {
    return (
      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <div
          className="w-full max-w-md rounded-xl border border-border bg-card p-6 sm:p-8 space-y-4 text-center"
          data-testid="spawn.wallet-setup"
        >
          <h1 className="text-xl font-semibold text-foreground" data-testid="spawn.wallet-heading">
            Set up your NEAR account
          </h1>
          <p className="text-sm text-muted-foreground">
            Your passkey derives a deterministic NEAR account — no seed phrase. It will own every
            deployment you spawn.
          </p>
          {identity.user?.email ? (
            <p className="text-xs text-muted-foreground">Signed in as {identity.user.email}</p>
          ) : null}
          <Button
            className="w-full"
            disabled={walletPending}
            data-testid="spawn.wallet-setup-button"
            onClick={async () => {
              setWalletPending(true);
              const result = await auth.near.linkPasskeyWallet({
                onSuccess: () => {
                  setWalletPending(false);
                  toast.success("NEAR account ready");
                },
                onError: (error) => {
                  setWalletPending(false);
                  toast.error(error.message || "Failed to set up your NEAR account");
                },
              });
              if (result) toast.success(result.accountId);
            }}
          >
            {walletPending ? "setting up…" : "Create my NEAR account"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Already have a NEAR wallet? Sign in with it from the{" "}
            <a href="/login" className="underline underline-offset-4">
              login page
            </a>
            .
          </p>
        </div>
      </div>
    );
  }

  return <SpawnConsole ownerAccountId={identity.nearAccountId} />;
}

function SpawnConsole({ ownerAccountId }: { ownerAccountId: string }) {
  const apiClient = useApiClient();
  const auth = useAuthClient();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [spawned, setSpawned] = useState<SpawnStatus | null>(null);

  const hostname = slug && SLUG_REGEX.test(slug) ? buildSpawnHostname(slug, ownerAccountId) : null;

  const preflight = useQuery({
    queryKey: ["spawn-preflight", hostname],
    queryFn: async () => {
      if (!hostname) return null;
      const result = await apiClient.bindingPreflight({ hostname });
      return result.hostname;
    },
    enabled: !!hostname,
  });

  const deployments = useQuery({
    queryKey: ["spawn-deployments"],
    queryFn: async () => {
      const tenants = (await apiClient.listTenants()) as DeploymentRow[];
      return tenants.filter((tenant) => tenant.ownerKind === "user" && !tenant.deletedAt);
    },
  });

  const status = useQuery({
    queryKey: ["spawn-status", spawned?.tenant.id],
    queryFn: async () => {
      if (!spawned) return null;
      return getSpawnStatus(apiClient, spawned.tenant.id);
    },
    enabled: !!spawned,
    refetchInterval: 5000,
  });

  const spawn = useMutation({
    mutationFn: async () => {
      if (!hostname) throw new Error("Pick a valid slug first");
      return spawnTenant(apiClient, { name: name.trim(), hostname });
    },
    onSuccess: (result) => {
      setSpawned({
        tenant: result.tenant,
        bindings: [result.binding],
        ownerAccountId: result.ownerAccountId,
        publishStatus: result.publishStatus,
      });
      toast.success(`Spawned ${result.tenant.name}`);
      void queryClient.invalidateQueries({ queryKey: ["spawn-deployments"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const publish = useMutation({
    mutationFn: async () => {
      const current = status.data ?? spawned;
      if (!current) throw new Error("Nothing to publish");
      return publishTenantConfig(apiClient, auth, {
        accountId: current.ownerAccountId,
        hostname: current.bindings.find((binding) => binding.isPrimary)?.hostname ?? "",
        title: current.tenant.name,
      });
    },
    onSuccess: ({ txHash }) => {
      toast.success(txHash ? `Published — ${txHash.slice(0, 12)}…` : "Published");
      void status.refetch();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const current = status.data ?? spawned;
  const gateway = gatewayForAccount(ownerAccountId);

  return (
    <div className="flex-1 px-6 py-12">
      <div className="mx-auto w-full max-w-xl space-y-8">
        <div className="space-y-2">
          <h1
            className="text-2xl font-semibold tracking-tight text-foreground"
            data-testid="spawn.heading"
          >
            Spawn a deployment
          </h1>
          <p className="text-sm text-muted-foreground">
            Signed in as <span className="font-mono text-foreground">{ownerAccountId}</span> —
            spawns are owned by this account.
          </p>
        </div>

        {!current ? (
          <div
            className="rounded-xl border border-border bg-card p-6 space-y-4"
            data-testid="spawn.form"
          >
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="spawn-name">
                Name
              </label>
              <Input
                id="spawn-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="My App"
                data-testid="spawn.name-input"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="spawn-slug">
                Address
              </label>
              <div className="flex items-center gap-2">
                <Input
                  id="spawn-slug"
                  value={slug}
                  onChange={(event) => setSlug(event.target.value.toLowerCase().trim())}
                  placeholder="my-app"
                  className="font-mono"
                  data-testid="spawn.slug-input"
                />
                <span className="text-sm text-muted-foreground whitespace-nowrap">.{gateway}</span>
              </div>
              {hostname ? (
                <p className="text-xs text-muted-foreground" data-testid="spawn.preflight">
                  {preflight.isPending
                    ? "checking…"
                    : preflight.data?.available
                      ? "available"
                      : "taken or invalid"}
                </p>
              ) : slug ? (
                <p className="text-xs text-destructive">
                  lowercase letters, digits, and dashes only
                </p>
              ) : null}
            </div>
            <Button
              className="w-full"
              disabled={!name.trim() || !hostname || !preflight.data?.available || spawn.isPending}
              onClick={() => spawn.mutate()}
              data-testid="spawn.submit"
            >
              {spawn.isPending ? "spawning…" : "Spawn"}
            </Button>
          </div>
        ) : (
          <SpawnedPanel
            status={current}
            publishPending={publish.isPending}
            onPublish={() => publish.mutate()}
            onReset={() => {
              setSpawned(null);
              void queryClient.invalidateQueries({ queryKey: ["spawn-deployments"] });
            }}
          />
        )}

        {deployments.data && deployments.data.length > 0 && !current ? (
          <div className="space-y-2" data-testid="spawn.deployments">
            <p className="text-sm font-medium text-foreground">Your deployments</p>
            <ul className="divide-y divide-border rounded-xl border border-border bg-card">
              {deployments.data.map((tenant: DeploymentRow) => (
                <li key={tenant.id} className="px-4 py-3 flex items-center justify-between text-sm">
                  <span className="text-foreground">{tenant.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {tenant.accountId}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SpawnedPanel({
  status,
  publishPending,
  onPublish,
  onReset,
}: {
  status: SpawnStatus;
  publishPending: boolean;
  onPublish: () => void;
  onReset: () => void;
}) {
  const binding = status.bindings.find((entry) => entry.isPrimary) ?? status.bindings[0];
  const pendingFunding = status.publishStatus === "pending_funding";

  return (
    <div
      className="rounded-xl border border-border bg-card p-6 space-y-5"
      data-testid="spawn.status"
    >
      <div className="space-y-1">
        <p className="text-lg font-semibold text-foreground">{status.tenant.name}</p>
        <p className="font-mono text-sm text-muted-foreground">{binding?.hostname}</p>
      </div>

      <div className="space-y-1 text-sm">
        <p className={binding?.isVerified ? "text-foreground" : "text-muted-foreground"}>
          binding: {binding?.isVerified ? "verified" : "pending verification"}
        </p>
        <p
          className={pendingFunding ? "text-destructive" : "text-foreground"}
          data-testid="spawn.publish-status"
        >
          {pendingFunding
            ? `account ${status.ownerAccountId} does not exist on-chain yet — fund it once, then publish`
            : "ready to publish"}
        </p>
      </div>

      {pendingFunding ? (
        <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-1 text-sm text-muted-foreground">
          <p>
            Send any wallet a state-init creation for{" "}
            <span className="font-mono text-foreground">{status.ownerAccountId}</span> (or use{" "}
            <a
              href="https://trezu.app/create"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-4"
            >
              trezu.app/create
            </a>
            ). The account exists as soon as the creation lands; publishing is gasless after that.
          </p>
        </div>
      ) : null}

      <div className="flex gap-2">
        <Button
          className="flex-1"
          disabled={publishPending}
          onClick={onPublish}
          data-testid="spawn.publish"
        >
          {publishPending ? "publishing…" : "Publish config"}
        </Button>
        <Button variant="outline" onClick={onReset} data-testid="spawn.new">
          Spawn another
        </Button>
      </div>

      <div className="space-y-2 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Code it locally</p>
        <pre
          className="overflow-x-auto rounded-lg bg-muted p-3 font-mono"
          data-testid="spawn.commands"
        >
          {`bos login
bos init --extends bos://${status.ownerAccountId}/citynode.app \\
  -a <your-local-account> --domain <your-local-domain>`}
        </pre>
        <p>
          `bos login` pairs this CLI with your session and mints an API key; `bos init` scaffolds
          the child runtime locally.
        </p>
      </div>
    </div>
  );
}
