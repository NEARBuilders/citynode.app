import { useForm, useSelector } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { buildRegistryConfigUrl } from "everything-dev/fastkv";
import { ArrowRight, Building2, CheckCircle2, Globe, Sparkles } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { getAccount, getActiveRuntime, sessionQueryKey, useApiClient, useAuthClient } from "@/app";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Field,
  FieldError,
  FieldLabel,
  Input,
  PageHeader,
  StepList,
  useStepper,
} from "@/components";
import { ConnectDao } from "@/components/connect-dao";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDaoConnection } from "@/lib/dao-connect";
import {
  childNodesQueryOptions,
  invalidateNodeQueries,
  rootNodesQueryOptions,
} from "@/lib/queries/nodes";
import { bindingPreflightQueryOptions, invalidateTenantQueries } from "@/lib/queries/tenants";
import { deriveSlug } from "@/lib/slug";
import { publishDaoTenantConfig } from "@/lib/tenant-deploy";
import {
  deriveTenantWizardNameFields,
  type NearNetworkId,
  nodeKinds,
  type TenantWizardValues,
  tenantWizardSchema,
} from "./-tenant-wizard";
import { loadTenantWizardParents } from "./-tenant-wizard-loader";

const DIRECT_COUNTRY_PARENT = "__direct-country__";

const tenantWizardDefaultValues: TenantWizardValues = {
  kind: "country",
  parentId: "",
  name: "",
  slug: "",
  tenantName: "",
};

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

export const Route = createFileRoute("/_layout/_admin/_dashboard/admin/tenants/new")({
  loader: ({ context }) =>
    loadTenantWizardParents({
      activeOrganizationId: context.auth.activeOrganizationId,
      apiClient: context.apiClient,
      queryClient: context.queryClient,
    }),
  head: () => ({
    title: "New Tenant | app",
    meta: [{ name: "description", content: "Create a new tenant, node, and domain binding." }],
  }),
  component: NewTenantPage,
});

function NewTenantPage() {
  const apiClient = useApiClient();
  const auth = useAuthClient();
  const queryClient = useQueryClient();
  const router = useRouter();
  const initialRootNodes = Route.useLoaderData();
  const { auth: adminAuth, runtimeConfig } = Route.useRouteContext();
  const gatewayId = getActiveRuntime(runtimeConfig)?.gatewayId ?? "citynode.app";
  const baseAccount = getAccount(runtimeConfig);
  const activeNetwork = auth.useActiveNetwork() as NearNetworkId;

  const hasOrg = !!adminAuth.activeOrganizationId;
  const daoConnection = useDaoConnection();

  const [phase, setPhase] = useState<"form" | "deploy">("form");
  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const orgSlugManuallyEdited = useRef(false);
  const [rootParentId, setRootParentId] = useState<string>(initialRootNodes[0]?.id ?? "");
  const slugManuallyEdited = useRef(false);
  const tenantNameManuallyEdited = useRef(false);
  const [verifyState, setVerifyState] = useState<"idle" | "checking" | "verified" | "failed">(
    "idle",
  );
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);
  const [createdTenantId, setCreatedTenantId] = useState<string | null>(null);

  const stepper = useStepper([
    { label: "Create tenant + node + binding", blocking: true },
    { label: "Publish config as DAO", blocking: false },
  ]);

  const form = useForm({
    defaultValues: tenantWizardDefaultValues,
    validators: {
      onChange: tenantWizardSchema,
      onSubmit: tenantWizardSchema,
    },
    onSubmit: async ({ value }) => {
      await submitMutation.mutateAsync(value);
    },
  });

  const formValues = useSelector(form.store, (state) => state.values);
  const { kind, slug, name, tenantName } = formValues;
  const hostname = useMemo(() => (slug ? `${slug}.${gatewayId}` : ""), [slug, gatewayId]);

  const { data: queriedRootNodes } = useQuery({
    ...rootNodesQueryOptions(apiClient),
    enabled: phase === "form" && hasOrg,
  });
  const rootNodes = queriedRootNodes ?? initialRootNodes;

  const { data: stateNodes = [] } = useQuery({
    ...childNodesQueryOptions(apiClient, rootParentId),
    enabled: phase === "form" && kind === "city" && !!rootParentId,
  });

  const { data: preflight } = useQuery({
    ...bindingPreflightQueryOptions(apiClient, hostname),
    enabled: phase === "form" && !!slug,
  });

  const orgMutation = useMutation({
    mutationFn: async () => {
      const { error } = await auth.organization.create({ name: orgName, slug: orgSlug });
      if (error) throw new Error(error.message);

      const { data: session, error: sessionError } = await auth.getSession({
        query: { disableCookieCache: true },
      });
      if (sessionError || !session) {
        throw new Error(
          `Organization created, but the session could not be refreshed: ${sessionError?.message ?? "no active session returned"}`,
        );
      }
      return session;
    },
    onSuccess: async (session) => {
      await queryClient.invalidateQueries({ queryKey: sessionQueryKey, refetchType: "none" });
      queryClient.setQueryData(sessionQueryKey, session);
      await queryClient.invalidateQueries({ queryKey: ["organizations"] });
      await router.invalidate();
      toast.success("Organization created — continue with the wizard");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to create organization"),
  });

  const submitMutation = useMutation({
    mutationFn: async (values: TenantWizardValues) => {
      const daoAccountId = daoConnection.daoAccountId;
      if (!daoAccountId) throw new Error("Connect a DAO account first");

      stepper.updateStep(0, "running");

      let tenantId: string | null = null;
      let nodeId: string | null = null;

      try {
        const tenant = await apiClient.createTenant({
          name: values.tenantName,
          accountId: daoAccountId,
          status: "active",
        });
        tenantId = tenant.id;

        const node = await apiClient.createNode({
          kind: values.kind,
          slug: values.slug,
          name: values.name,
          parentId: values.kind === "country" ? null : values.parentId,
          tenantId: tenant.id,
        });
        nodeId = node.id;

        const binding = await apiClient.createBinding({
          tenantId: tenant.id,
          hostname: `${values.slug}.${gatewayId}`,
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
    onSuccess: async () => {
      await Promise.all([invalidateNodeQueries(queryClient), invalidateTenantQueries(queryClient)]);
      await router.invalidate({ sync: true });
      setPhase("deploy");
    },
    onError: (error: Error) =>
      toast.error(error.message || "Failed to create tenant — rolled back"),
  });

  const deployPublish = useMutation({
    mutationFn: async () => {
      if (!createdTenantId) throw new Error("Tenant not created yet");
      const daoAccountId = daoConnection.daoAccountId;
      if (!daoAccountId) throw new Error("Disconnect detected — reconnect and retry");

      stepper.updateStep(1, "running");

      try {
        await publishDaoTenantConfig(apiClient, {
          daoAccountId,
          gatewayId,
          baseAccount,
          hostname,
          title: tenantName || name,
        });
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

  const formValuesValid = tenantWizardSchema.safeParse(formValues).success;
  const canSubmitDuringForm =
    hasOrg &&
    formValuesValid &&
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
                    <Link to="/tenant/$tenantId" params={{ tenantId: slug || createdTenantId }}>
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
                    <Link to="/tenant/$tenantId" params={{ tenantId: slug || createdTenantId }}>
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
                    setOrgSlug(deriveSlug(e.target.value, orgSlug, orgSlugManuallyEdited.current));
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
                  onChange={(e) => {
                    orgSlugManuallyEdited.current = true;
                    setOrgSlug(e.target.value.replace(/[^a-z0-9-]/g, ""));
                  }}
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
            form.handleSubmit();
          }}
          className="space-y-6"
        >
          <ConnectDao />

          <Card>
            <CardContent className="p-6 space-y-4">
              <h2 className="text-sm font-semibold text-foreground">Node details</h2>

              <form.Field name="kind">
                {(field) => (
                  <Field>
                    <FieldLabel>kind</FieldLabel>
                    <div className="flex gap-2">
                      {nodeKinds.map((nodeKind) => (
                        <Button
                          key={nodeKind}
                          type="button"
                          variant={field.state.value === nodeKind ? "default" : "outline"}
                          size="sm"
                          onClick={() => {
                            field.handleChange(nodeKind);
                            const nextRootParentId =
                              nodeKind === "country" ? "" : rootParentId || rootNodes[0]?.id || "";
                            setRootParentId(nextRootParentId);
                            form.setFieldValue("parentId", nextRootParentId, {
                              dontUpdateMeta: true,
                            });
                          }}
                        >
                          {nodeKind}
                        </Button>
                      ))}
                    </div>
                  </Field>
                )}
              </form.Field>

              {kind !== "country" && (
                <form.Field name="parentId">
                  {(field) => {
                    const errors = field.state.meta.isTouched ? field.state.meta.errors : [];
                    const countryValue = kind === "city" ? rootParentId : field.state.value;
                    return (
                      <>
                        <Field data-invalid={errors.length > 0 || undefined}>
                          <FieldLabel htmlFor="parent-root">parent country</FieldLabel>
                          <Select
                            value={countryValue}
                            onValueChange={(value) => {
                              setRootParentId(value);
                              field.handleChange(value);
                            }}
                            required
                          >
                            <SelectTrigger
                              id="parent-root"
                              className="w-full"
                              aria-invalid={errors.length > 0 || undefined}
                            >
                              <SelectValue placeholder="select a country…" />
                            </SelectTrigger>
                            <SelectContent>
                              {rootNodes.map((node) => (
                                <SelectItem key={node.id} value={node.id}>
                                  {node.name} ({node.slug})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FieldError errors={errors} />
                        </Field>

                        {kind === "city" && rootParentId && stateNodes.length > 0 && (
                          <Field>
                            <FieldLabel htmlFor="parent-state">parent state (optional)</FieldLabel>
                            <Select
                              value={
                                field.state.value === rootParentId
                                  ? DIRECT_COUNTRY_PARENT
                                  : field.state.value
                              }
                              onValueChange={(value) =>
                                field.handleChange(
                                  value === DIRECT_COUNTRY_PARENT ? rootParentId : value,
                                )
                              }
                            >
                              <SelectTrigger id="parent-state" className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={DIRECT_COUNTRY_PARENT}>
                                  directly under country
                                </SelectItem>
                                {stateNodes.map((node) => (
                                  <SelectItem key={node.id} value={node.id}>
                                    {node.name} ({node.slug})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </Field>
                        )}
                      </>
                    );
                  }}
                </form.Field>
              )}

              <form.Field name="name">
                {(field) => {
                  const errors = field.state.meta.isTouched ? field.state.meta.errors : [];
                  return (
                    <Field data-invalid={errors.length > 0 || undefined}>
                      <FieldLabel htmlFor="node-name">name</FieldLabel>
                      <Input
                        id="node-name"
                        name={field.name}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => {
                          const value = e.target.value;
                          const derived = deriveTenantWizardNameFields(
                            value,
                            {
                              slug: form.getFieldValue("slug"),
                              tenantName: form.getFieldValue("tenantName"),
                            },
                            {
                              slug: slugManuallyEdited.current,
                              tenantName: tenantNameManuallyEdited.current,
                            },
                          );

                          field.handleChange(value);
                          if (!slugManuallyEdited.current) {
                            form.setFieldValue("slug", derived.slug, {
                              dontUpdateMeta: true,
                            });
                          }
                          if (!tenantNameManuallyEdited.current) {
                            form.setFieldValue("tenantName", derived.tenantName, {
                              dontUpdateMeta: true,
                            });
                          }
                        }}
                        placeholder="Chicago"
                        aria-invalid={errors.length > 0 || undefined}
                        required
                      />
                      <FieldError errors={errors} />
                    </Field>
                  );
                }}
              </form.Field>

              <form.Field name="slug">
                {(field) => {
                  const errors = field.state.meta.isTouched ? field.state.meta.errors : [];
                  return (
                    <Field data-invalid={errors.length > 0 || undefined}>
                      <FieldLabel htmlFor="node-slug">slug</FieldLabel>
                      <Input
                        id="node-slug"
                        name={field.name}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => {
                          slugManuallyEdited.current = true;
                          field.setMeta((meta) => ({ ...meta, isTouched: true }));
                          field.handleChange(e.target.value.replace(/[^a-z0-9-]/g, ""));
                        }}
                        placeholder="chicago"
                        pattern="[a-z0-9-]+"
                        aria-invalid={errors.length > 0 || undefined}
                        required
                      />
                      <FieldError errors={errors} />
                    </Field>
                  );
                }}
              </form.Field>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 space-y-4">
              <h2 className="text-sm font-semibold text-foreground">Tenant + binding</h2>

              <form.Field name="tenantName">
                {(field) => {
                  const errors = field.state.meta.isTouched ? field.state.meta.errors : [];
                  return (
                    <Field data-invalid={errors.length > 0 || undefined}>
                      <FieldLabel htmlFor="tenant-name">tenant name</FieldLabel>
                      <Input
                        id="tenant-name"
                        name={field.name}
                        value={field.state.value}
                        placeholder="Chicago City Node"
                        onBlur={field.handleBlur}
                        onChange={(e) => {
                          tenantNameManuallyEdited.current = true;
                          field.setMeta((meta) => ({ ...meta, isTouched: true }));
                          field.handleChange(e.target.value);
                        }}
                        aria-invalid={errors.length > 0 || undefined}
                        required
                      />
                      <FieldError errors={errors} />
                    </Field>
                  );
                }}
              </form.Field>

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
            <form.Subscribe selector={(state) => state.canSubmit}>
              {(canSubmit) => (
                <Button
                  type="submit"
                  disabled={submitMutation.isPending || !canSubmit || !canSubmitDuringForm}
                >
                  {submitMutation.isPending ? "creating…" : "create tenant + node"}
                </Button>
              )}
            </form.Subscribe>
          </div>
        </form>
      )}
    </div>
  );
}
