import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { buildRegistryConfigUrl } from "everything-dev/fastkv";
import { ArrowRight, Building2, CheckCircle2, Globe, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { getAccount, getActiveRuntime, useApiClient, useAuthClient } from "@/app";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Field,
  FieldLabel,
  Input,
  PageHeader,
  StepList,
  useStepper,
} from "@/components";
import { ConnectDao } from "@/components/connect-dao";
import {
  buildTenantPublishConfig,
  signAsDaoTransaction,
  useDaoConnection,
} from "@/lib/dao-connect";
import type { NearNetworkId } from "./tenant-wizard";

type NodeKind = "country" | "state" | "city";

interface FastKvEntry {
  current_account_id?: string;
  key?: string;
  value?: unknown;
}

async function fastKvAccountHasConfig(daoAccountId: string, gatewayId: string): Promise<boolean> {
  const url = buildRegistryConfigUrl(daoAccountId, gatewayId);
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) return false;
  const payload = (await res.json()) as { entries?: Array<FastKvEntry | null> };
  return Boolean(payload.entries?.find((e) => e && e.value != null));
}

function generateSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const Route = createFileRoute("/_layout/_admin/_dashboard/admin/tenants/new")({
  head: () => ({
    title: "New Tenant | app",
    meta: [{ name: "description", content: "Create a new tenant, node, and domain binding." }],
  }),
  component: NewTenantPage,
});

function NewTenantPage() {
  const apiClient = useApiClient();
  const auth = useAuthClient();
  const { auth: adminAuth, runtimeConfig } = Route.useRouteContext();
  const gatewayId = getActiveRuntime(runtimeConfig)?.gatewayId ?? "citynode.app";
  const baseAccount = getAccount(runtimeConfig);
  const activeNetwork = auth.useActiveNetwork() as NearNetworkId;

  const hasOrg = !!adminAuth.activeOrganizationId;
  const daoConnection = useDaoConnection();

  const [phase, setPhase] = useState<"form" | "deploy">("form");
  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [kind, setKind] = useState<NodeKind>("country");
  const [rootParentId, setRootParentId] = useState<string>("");
  const [stateParentId, setStateParentId] = useState<string>("");
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [verifyState, setVerifyState] = useState<"idle" | "checking" | "verified" | "failed">(
    "idle",
  );
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);
  const [createdTenantId, setCreatedTenantId] = useState<string | null>(null);

  const stepper = useStepper([
    { label: "Create tenant + node + binding", blocking: true },
    { label: "Publish config as DAO", blocking: false },
  ]);

  const hostname = useMemo(() => (slug ? `${slug}.${gatewayId}` : ""), [slug, gatewayId]);

  useEffect(() => {
    if (!tenantName) {
      setTenantName(name);
    }
  }, [name, tenantName]);

  const { data: rootNodes = [] } = useQuery({
    queryKey: ["root-nodes"],
    queryFn: async () => apiClient.listRootNodes(),
    enabled: phase === "form" && hasOrg,
  });

  const { data: stateNodes = [] } = useQuery({
    queryKey: ["children", rootParentId],
    queryFn: async () => apiClient.listChildren({ nodeId: rootParentId }),
    enabled: phase === "form" && kind === "city" && !!rootParentId,
  });

  const { data: preflight } = useQuery({
    queryKey: ["preflight", hostname],
    queryFn: async () => apiClient.bindingPreflight({ hostname }),
    enabled: phase === "form" && !!slug,
    staleTime: 5000,
  });

  const parentId = useMemo(() => {
    if (kind === "country") return null;
    if (kind === "state") return rootParentId || null;
    if (kind === "city") return stateParentId || rootParentId || null;
    return null;
  }, [kind, rootParentId, stateParentId]);

  function handleNameChange(value: string) {
    setName(value);
    if (!slug || slug === generateSlug(name.slice(0, -1))) {
      setSlug(generateSlug(value));
    }
  }

  const orgMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await auth.organization.create({ name: orgName, slug: orgSlug });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      toast.success("Organization created — continue with the wizard");
      setTimeout(() => window.location.reload(), 500);
    },
    onError: (error: Error) => toast.error(error.message || "Failed to create organization"),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const daoAccountId = daoConnection.daoAccountId;
      if (!daoAccountId) throw new Error("Connect a DAO account first");

      stepper.updateStep(0, "running");

      let tenantId: string | null = null;
      let nodeId: string | null = null;

      try {
        const tenant = await apiClient.createTenant({
          name: tenantName || name,
          accountId: daoAccountId,
          status: "active",
        });
        tenantId = tenant.id;

        const node = await apiClient.createNode({
          kind,
          slug,
          name,
          parentId,
          tenantId: tenant.id,
        });
        nodeId = node.id;

        const binding = await apiClient.createBinding({
          tenantId: tenant.id,
          hostname,
          isPrimary: true,
        });

        setCreatedTenantId(tenant.id);
        stepper.updateStep(0, "success");
        return { tenant, node, binding };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        stepper.updateStep(0, "failed", msg);

        if (nodeId) {
          try {
            await apiClient.deleteNode({ nodeId });
          } catch {}
        }
        if (tenantId) {
          try {
            await apiClient.deleteTenant({ tenantId });
          } catch {}
        }
        throw err;
      }
    },
    onSuccess: () => setPhase("deploy"),
    onError: (error: Error) =>
      toast.error(error.message || "Failed to create tenant — rolled back"),
  });

  async function publishConfig(preparedData: {
    contractId: string;
    methodName: string;
    args: Record<string, string>;
    gas: string;
    attachedDeposit: string;
  }) {
    const daoAccountId = daoConnection.daoAccountId;
    if (!daoAccountId) throw new Error("Connect a DAO account first");
    return signAsDaoTransaction(daoAccountId, {
      receiverId: preparedData.contractId,
      methodName: preparedData.methodName,
      args: preparedData.args as unknown as Record<string, unknown>,
      gas: preparedData.gas,
      attachedDeposit: preparedData.attachedDeposit,
    });
  }

  const deployPublish = useMutation({
    mutationFn: async () => {
      if (!createdTenantId) throw new Error("Tenant not created yet");
      const daoAccountId = daoConnection.daoAccountId;
      if (!daoAccountId) throw new Error("Disconnect detected — reconnect and retry");

      stepper.updateStep(1, "running");

      const tenantConfig = buildTenantPublishConfig({
        daoAccountId,
        gatewayId,
        baseAccount,
        hostname,
        title: tenantName || name,
      });

      const prepared = await apiClient.apps.prepareRegistryConfigWrite({
        accountId: daoAccountId,
        gatewayId,
        config: tenantConfig as unknown as Record<string, unknown>,
      });

      try {
        await publishConfig(prepared.data);
        stepper.updateStep(1, "success");
        return true;
      } catch (err) {
        stepper.updateStep(1, "failed", err instanceof Error ? err.message : String(err));
        throw err;
      }
    },
    onSuccess: () => toast.success("Config submitted to DAO"),
    onError: (error: Error) => toast.error(error.message || "Failed to submit config"),
  });

  async function recheckPublish() {
    if (!daoConnection.daoAccountId) return;
    setVerifyState("checking");
    setVerifyMessage(null);
    try {
      const ok = await fastKvAccountHasConfig(daoConnection.daoAccountId, gatewayId);
      if (ok) {
        setVerifyState("verified");
        return;
      }
      setVerifyState("failed");
      setVerifyMessage("config not yet published — approve in Trezu if pending");
    } catch (err) {
      setVerifyState("failed");
      setVerifyMessage(err instanceof Error ? err.message : String(err));
    }
  }

  const canSubmitDuringForm =
    hasOrg &&
    !!slug &&
    !!name &&
    !!tenantName &&
    (kind === "country" || !!parentId) &&
    preflight?.hostname.available !== false &&
    daoConnection.status === "connected" &&
    !!daoConnection.daoAccountId &&
    activeNetwork === "mainnet";

  if (phase === "deploy") {
    const allDone = stepper.steps.every((s) => s.state === "success");
    const hasFailure = stepper.steps.some((s) => s.state === "failed");
    const publishStep = stepper.steps[1];

    return (
      <div className="space-y-8">
        <PageHeader
          icon={Sparkles}
          label="Deploying"
          title={allDone ? "Deployment complete" : "Deploying tenant…"}
        />

        <ConnectDao />

        <Card>
          <CardContent className="p-6 space-y-6">
            <StepList steps={stepper.steps} />

            {publishStep?.state === "success" && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Transaction submitted as{" "}
                  <code className="font-mono text-xs">{daoConnection.daoAccountId}</code>. Trezu
                  multiplexes the call into your DAO's internal proposal — sign in to trezu.app to
                  confirm or wait for council approval.
                </p>
                {verifyMessage && (
                  <p
                    className={
                      verifyState === "verified"
                        ? "text-sm text-foreground"
                        : "text-sm text-muted-foreground"
                    }
                  >
                    {verifyMessage}
                  </p>
                )}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void recheckPublish()}
                    disabled={verifyState === "checking"}
                  >
                    {verifyState === "checking" ? "rechecking…" : "recheck publish"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      stepper.updateStep(1, "pending");
                      deployPublish.reset();
                    }}
                  >
                    re-submit
                  </Button>
                </div>
              </div>
            )}

            {publishStep?.state === "failed" && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Publish failed — re-check the Trezu connection or re-submit.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    stepper.updateStep(1, "pending");
                    deployPublish.reset();
                  }}
                >
                  retry publish
                </Button>
              </div>
            )}

            {publishStep?.state === "pending" && (
              <Button
                size="sm"
                onClick={() => deployPublish.mutate()}
                disabled={deployPublish.isPending}
              >
                publish config via DAO
              </Button>
            )}

            {verifyState === "verified" && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  Tenant deployed at <code className="font-mono text-xs">{hostname}</code>
                </div>
                {createdTenantId && (
                  <Button asChild size="sm">
                    <Link to="/tenant/$tenantId" params={{ tenantId: createdTenantId }}>
                      open tenant
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                )}
              </div>
            )}

            {hasFailure && !verifyState && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Some steps failed. API records were created — you can retry on-chain steps from
                  the tenant detail page.
                </p>
                {createdTenantId && (
                  <Button asChild variant="outline" size="sm">
                    <Link to="/tenant/$tenantId" params={{ tenantId: createdTenantId }}>
                      go to tenant
                    </Link>
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        icon={Sparkles}
        label="New tenant"
        title="Tenant + node creation"
        description="Create a tenant, a geographic node, and a primary domain binding in one flow."
      />

      {activeNetwork !== "mainnet" && (
        <Card>
          <CardContent className="p-6 space-y-3">
            <p className="text-sm text-foreground font-semibold">
              DAO tenant creation is mainnet-only
            </p>
            <p className="text-xs text-muted-foreground">
              Switch the network to mainnet to create tenants through your DAO account.
            </p>
          </CardContent>
        </Card>
      )}

      {!hasOrg && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">
                Create an organization first
              </h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Tenants belong to an organization. Create one to continue.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                orgMutation.mutate();
              }}
              className="space-y-4"
            >
              <Field>
                <FieldLabel htmlFor="org-name">name</FieldLabel>
                <Input
                  id="org-name"
                  value={orgName}
                  onChange={(e) => {
                    setOrgName(e.target.value);
                    if (!orgSlug) setOrgSlug(generateSlug(e.target.value));
                  }}
                  placeholder="My Organization"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="org-slug">slug</FieldLabel>
                <Input
                  id="org-slug"
                  value={orgSlug}
                  onChange={(e) => setOrgSlug(e.target.value.replace(/[^a-z0-9-]/g, ""))}
                  placeholder="my-organization"
                  pattern="[a-z0-9-]+"
                  required
                />
              </Field>
              <Button
                type="submit"
                size="sm"
                disabled={orgMutation.isPending || !orgName || !orgSlug}
              >
                {orgMutation.isPending ? "creating…" : "create organization"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {hasOrg && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitMutation.mutate();
          }}
          className="space-y-6"
        >
          <ConnectDao />

          <Card>
            <CardContent className="p-6 space-y-4">
              <h2 className="text-sm font-semibold text-foreground">Node details</h2>

              <Field>
                <FieldLabel>kind</FieldLabel>
                <div className="flex gap-2">
                  {(["country", "state", "city"] as const).map((k) => (
                    <Button
                      key={k}
                      type="button"
                      variant={kind === k ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setKind(k);
                        setRootParentId("");
                        setStateParentId("");
                      }}
                    >
                      {k}
                    </Button>
                  ))}
                </div>
              </Field>

              {kind !== "country" && (
                <Field>
                  <FieldLabel htmlFor="parent-root">parent country</FieldLabel>
                  <select
                    id="parent-root"
                    value={rootParentId}
                    onChange={(e) => {
                      setRootParentId(e.target.value);
                      setStateParentId("");
                    }}
                    className="w-full h-9 rounded-[10px] border-2 border-outset border-border-strong bg-card px-3 text-sm text-foreground"
                    required
                  >
                    <option value="">select a country…</option>
                    {rootNodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name} ({n.slug})
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              {kind === "city" && rootParentId && stateNodes.length > 0 && (
                <Field>
                  <FieldLabel htmlFor="parent-state">parent state (optional)</FieldLabel>
                  <select
                    id="parent-state"
                    value={stateParentId}
                    onChange={(e) => setStateParentId(e.target.value)}
                    className="w-full h-9 rounded-[10px] border-2 border-outset border-border-strong bg-card px-3 text-sm text-foreground"
                  >
                    <option value="">directly under country</option>
                    {stateNodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name} ({n.slug})
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              <Field>
                <FieldLabel htmlFor="node-name">name</FieldLabel>
                <Input
                  id="node-name"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="Chicago"
                  required
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="node-slug">slug</FieldLabel>
                <Input
                  id="node-slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.replace(/[^a-z0-9-]/g, ""))}
                  placeholder="chicago"
                  pattern="[a-z0-9-]+"
                  required
                />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 space-y-4">
              <h2 className="text-sm font-semibold text-foreground">Tenant + binding</h2>

              <Field>
                <FieldLabel htmlFor="tenant-name">tenant name</FieldLabel>
                <Input
                  id="tenant-name"
                  value={tenantName}
                  placeholder="Chicago City Node"
                  onChange={(e) => setTenantName(e.target.value)}
                  required
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="account-id">NEAR account id</FieldLabel>
                <Input
                  id="account-id"
                  value={daoConnection.daoAccountId ?? ""}
                  readOnly
                  placeholder="connect a DAO account to set the tenant account id"
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  Tenant account = the connected DAO. Config publishes under{" "}
                  <code>bos://&lt;dao&gt;/citynode.app</code> with <code>extends</code> set to{" "}
                  <code>b{`os://${baseAccount}/citynode.app`}</code>.
                </p>
              </Field>

              <Field>
                <FieldLabel>hostname</FieldLabel>
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <code className="font-mono text-sm text-foreground">{hostname || "—"}</code>
                  {preflight?.hostname.available === true && (
                    <Badge variant="secondary">available</Badge>
                  )}
                  {preflight?.hostname.available === false && (
                    <Badge variant="destructive">taken</Badge>
                  )}
                </div>
              </Field>
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link to="/admin/tenants">cancel</Link>
            </Button>
            <Button type="submit" disabled={submitMutation.isPending || !canSubmitDuringForm}>
              {submitMutation.isPending ? "creating…" : "create tenant + node"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
