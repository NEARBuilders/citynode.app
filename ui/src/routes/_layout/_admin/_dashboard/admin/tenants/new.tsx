import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Building2, CheckCircle2, Globe, Sparkles } from "lucide-react";
import type { TransactionBuilder } from "near-kit";
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
import {
  type AuthRuntimeVariables,
  type NearNetworkId,
  resolveTenantIdentity,
} from "./tenant-wizard";

const CONFIG_GAS = "300000000000000";

type NodeKind = "country" | "state" | "city";

async function publishTenantConfig(
  apiClient: ReturnType<typeof useApiClient>,
  auth: ReturnType<typeof useAuthClient>,
  input: {
    accountId: string;
    gatewayId: string;
    hostname: string;
    name: string;
    parentAccount: string;
  },
) {
  const tenantConfig = {
    extends: `bos://${input.parentAccount}/${input.gatewayId}`,
    account: input.accountId,
    domain: input.hostname,
    title: input.name,
    description: input.name,
  };

  const prepared = await apiClient.apps.prepareRegistryConfigWrite({
    accountId: input.accountId,
    gatewayId: input.gatewayId,
    config: tenantConfig,
  });

  const relayerInfo = await auth.near.getRelayerInfo();
  const hasRelayer = relayerInfo.data?.enabled === true;

  if (hasRelayer) {
    const signed = await auth.near.buildSignedDelegateAction(
      prepared.data.contractId,
      (builder: TransactionBuilder) =>
        builder.functionCall(
          prepared.data.contractId,
          prepared.data.methodName,
          prepared.data.args,
          {
            gas: CONFIG_GAS,
            attachedDeposit: 0n,
          },
        ),
    );
    const relayed = await auth.near.relayTransaction({ payload: signed });
    if (relayed.error) throw new Error(relayed.error.message);
    return relayed;
  }

  const signerAccountId = auth.near.getAccountId();
  if (!signerAccountId) throw new Error("Connect a NEAR wallet first");

  return auth.near
    .getNearClient()
    .transaction(signerAccountId)
    .functionCall(prepared.data.contractId, prepared.data.methodName, prepared.data.args, {
      gas: CONFIG_GAS,
      attachedDeposit: 0n,
    })
    .send({ waitUntil: "EXECUTED" });
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
  const activeNetwork = auth.useActiveNetwork() as NearNetworkId;
  const authVariables = runtimeConfig?.auth?.variables as AuthRuntimeVariables | undefined;

  const hasOrg = !!adminAuth.activeOrganizationId;

  const [phase, setPhase] = useState<"form" | "deploy">("form");

  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");

  const [kind, setKind] = useState<NodeKind>("country");
  const [rootParentId, setRootParentId] = useState<string>("");
  const [stateParentId, setStateParentId] = useState<string>("");
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");

  const [tenantName, setTenantName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [tenantNameTouched, setTenantNameTouched] = useState(false);
  const [accountIdTouched, setAccountIdTouched] = useState(false);

  const { parentAccount, accountId: suggestedAccountId } = resolveTenantIdentity({
    slug,
    network: activeNetwork,
    authVariables,
    mainnetAccount: getAccount(runtimeConfig),
  });

  const [createdTenantId, setCreatedTenantId] = useState<string | null>(null);

  const stepper = useStepper([
    { label: "Create tenant + node + binding", blocking: true },
    { label: "Create NEAR subaccount", blocking: false },
    { label: "Publish registry config", blocking: false },
  ]);

  const hostname = useMemo(() => (slug ? `${slug}.${gatewayId}` : ""), [slug, gatewayId]);

  useEffect(() => {
    if (!accountIdTouched) {
      setAccountId(suggestedAccountId);
    }
  }, [accountIdTouched, suggestedAccountId]);

  useEffect(() => {
    if (!tenantNameTouched) {
      setTenantName(name);
    }
  }, [name, tenantNameTouched]);

  const { data: rootNodes = [] } = useQuery({
    queryKey: ["root-nodes"],
    queryFn: async () => apiClient.listRootNodes(),
    enabled: phase === "form",
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

  const handleNameChange = (value: string) => {
    setName(value);
    if (!slug || slug === generateSlug(name.slice(0, -1))) {
      const newSlug = generateSlug(value);
      setSlug(newSlug);
    }
  };

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
      stepper.updateStep(0, "running");

      let tenantId: string | null = null;
      let nodeId: string | null = null;

      try {
        const tenant = await apiClient.createTenant({
          name: tenantName || name,
          accountId,
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
    onSuccess: () => {
      setPhase("deploy");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create tenant — rolled back");
    },
  });

  const deploySubaccount = useMutation({
    mutationFn: async () => {
      const subAccountName = slug;
      const { data: avail } = await auth.near.checkSubAccountAvailability({
        subAccountName,
        network: activeNetwork,
      });
      if (!avail?.available) {
        throw new Error(avail?.reason ?? "Sub-account unavailable");
      }
      const connected = await auth.near.ensureConnected();
      if (!connected) throw new Error("Connect a NEAR wallet first");
      const publicKey = auth.near.getState()?.publicKey;
      if (!publicKey) throw new Error("Connected wallet did not provide a public key");
      return auth.near.createSubAccount({
        subAccountName,
        publicKey,
        network: activeNetwork,
      });
    },
    onSuccess: () => {
      stepper.updateStep(1, "success");
      toast.success("NEAR subaccount created");
    },
    onError: (error: Error) => {
      stepper.updateStep(1, "failed", error.message);
    },
  });

  const deployPublish = useMutation({
    mutationFn: async () => {
      if (!createdTenantId) throw new Error("Tenant not created yet");
      return publishTenantConfig(apiClient, auth, {
        accountId,
        gatewayId,
        hostname,
        name: tenantName || name,
        parentAccount,
      });
    },
    onSuccess: () => {
      stepper.updateStep(2, "success");
      toast.success("Registry config published");
    },
    onError: (error: Error) => {
      stepper.updateStep(2, "failed", error.message);
    },
  });

  const canSubmit =
    !!slug &&
    !!name &&
    !!accountId &&
    !!tenantName &&
    (kind === "country" || !!parentId) &&
    preflight?.hostname.available !== false;

  if (phase === "deploy") {
    const allDone = stepper.steps.every((s) => s.state === "success");
    const hasFailure = stepper.steps.some((s) => s.state === "failed");

    return (
      <div className="space-y-8">
        <PageHeader
          icon={Sparkles}
          label="Deploying"
          title={allDone ? "Deployment complete" : "Deploying tenant…"}
        />

        <Card>
          <CardContent className="p-6 space-y-6">
            <StepList steps={stepper.steps} />

            {stepper.steps[0].state === "success" && stepper.steps[1].state === "pending" && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  API records created. Now deploying on-chain — these steps are non-blocking and can
                  be retried later from the tenant page.
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => deploySubaccount.mutate()}
                    disabled={deploySubaccount.isPending}
                  >
                    create NEAR subaccount
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => deployPublish.mutate()}
                    disabled={deployPublish.isPending}
                  >
                    publish config
                  </Button>
                </div>
              </div>
            )}

            {(stepper.steps[1].state === "success" || stepper.steps[1].state === "failed") &&
              stepper.steps[2].state === "pending" && (
                <Button
                  size="sm"
                  onClick={() => deployPublish.mutate()}
                  disabled={deployPublish.isPending}
                >
                  publish registry config
                </Button>
              )}

            {stepper.steps[1].state === "failed" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  stepper.updateStep(1, "pending");
                  deploySubaccount.reset();
                }}
              >
                retry subaccount
              </Button>
            )}

            {stepper.steps[2].state === "failed" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  stepper.updateStep(2, "pending");
                  deployPublish.reset();
                }}
              >
                retry publish
              </Button>
            )}

            {allDone && (
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

            {hasFailure && (
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
                  onChange={(e) => {
                    setTenantName(e.target.value);
                    setTenantNameTouched(true);
                  }}
                  required
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="account-id">NEAR account id</FieldLabel>
                <Input
                  id="account-id"
                  value={accountId}
                  onChange={(e) => {
                    setAccountId(e.target.value);
                    setAccountIdTouched(true);
                  }}
                  placeholder={`${slug || "chicago"}.${parentAccount}`}
                  className="font-mono text-xs"
                  required
                />
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
            <Button type="submit" disabled={submitMutation.isPending || !canSubmit}>
              {submitMutation.isPending ? "creating…" : "create tenant + node"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
