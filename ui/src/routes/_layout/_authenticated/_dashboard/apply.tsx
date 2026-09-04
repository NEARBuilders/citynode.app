import { useForm, useSelector } from "@tanstack/react-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Send } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { getActiveRuntime, useApiClient } from "@/app";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  PageContainer,
  PageHeader,
  Textarea,
} from "@/components";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { childNodesQueryOptions, rootNodesQueryOptions } from "@/lib/queries/nodes";
import { bindingPreflightQueryOptions } from "@/lib/queries/tenants";
import { loadNodeApplicationParents } from "./-apply-loader";
import {
  canSubmitNodeApplication,
  deriveNodeApplicationSlug,
  type NodeApplicationValues,
  nodeApplicationKinds,
  nodeApplicationSchema,
  proposeNodeApplication,
  readSessionNearAccountId,
} from "./-node-application";

const DIRECT_COUNTRY_PARENT = "__direct-country__";

const defaultValues: NodeApplicationValues = {
  kind: "country",
  parentId: null,
  name: "",
  slug: "",
  motivation: "",
};

export const Route = createFileRoute("/_layout/_authenticated/_dashboard/apply")({
  loader: ({ context }) =>
    loadNodeApplicationParents({
      apiClient: context.apiClient,
      queryClient: context.queryClient,
    }),
  head: () => ({
    meta: [{ title: "Apply | app" }, { name: "description", content: "Apply to run a City Node." }],
  }),
  component: ApplyPage,
});

function ApplyPage() {
  const apiClient = useApiClient();
  const initialRootNodes = Route.useLoaderData();
  const { auth, runtimeConfig, session } = Route.useRouteContext();
  const gatewayId = getActiveRuntime(runtimeConfig)?.gatewayId ?? "citynode.app";
  const activeOrgId = auth.activeOrganizationId;
  const nearAccountId = readSessionNearAccountId(session?.user);
  const slugManuallyEdited = useRef(false);
  const [rootParentId, setRootParentId] = useState(initialRootNodes[0]?.id ?? "");
  const [submittedProposalId, setSubmittedProposalId] = useState<string | null>(null);

  const form = useForm({
    defaultValues,
    validators: { onChange: nodeApplicationSchema, onSubmit: nodeApplicationSchema },
    onSubmit: async ({ value }) => submitMutation.mutateAsync(value),
  });
  const formValues = useSelector(form.store, (state) => state.values);
  const hostname = formValues.slug ? `${formValues.slug}.${gatewayId}` : "";

  const { data: queriedRootNodes } = useQuery(rootNodesQueryOptions(apiClient));
  const rootNodes = queriedRootNodes ?? initialRootNodes;
  const { data: stateNodes = [], isLoading: statesLoading } = useQuery({
    ...childNodesQueryOptions(apiClient, rootParentId),
    enabled: formValues.kind === "city" && !!rootParentId,
  });
  const { data: preflight, isFetching: preflightLoading } = useQuery({
    ...bindingPreflightQueryOptions(apiClient, hostname),
    enabled: !!hostname,
  });

  const submitMutation = useMutation({
    mutationFn: async (values: NodeApplicationValues) => {
      if (!activeOrgId) throw new Error("Select an active organization first");
      if (!nearAccountId) throw new Error("Connect a NEAR account first");
      return proposeNodeApplication(apiClient, values, {
        orgId: activeOrgId,
        accountId: nearAccountId,
      });
    },
    onSuccess: ({ data: proposal }) => {
      setSubmittedProposalId(proposal.id);
      toast.success("Node application submitted", {
        description: "A platform administrator can now review it.",
      });
    },
    onError: (error: Error) => toast.error(error.message || "Failed to submit application"),
  });

  const canSubmit = canSubmitNodeApplication({
    values: formValues,
    orgId: activeOrgId,
    accountId: nearAccountId,
    hostnameAvailable: preflight?.hostname.available === true,
    preflightLoading,
    submitting: submitMutation.isPending,
  });

  if (submittedProposalId) {
    return (
      <PageContainer variant="wide">
        <Card>
          <CardContent className="space-y-4 p-8 text-center">
            <CheckCircle2 className="mx-auto size-10 text-primary" />
            <div className="space-y-1">
              <h1 className="text-xl font-semibold text-foreground">Application submitted</h1>
              <p className="text-sm text-muted-foreground">
                Your proposal is awaiting platform administrator review.
              </p>
            </div>
            <p className="font-mono text-xs text-muted-foreground">{submittedProposalId}</p>
            <Button asChild variant="outline">
              <Link to="/dashboard">back to dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer variant="wide">
      <div className="space-y-8">
        <PageHeader
          title="Apply to run a City Node"
          description="Propose a country, state, or city node for platform administrator review."
        />

        {!activeOrgId && (
          <Card>
            <CardContent className="space-y-3 p-6">
              <h2 className="font-semibold text-foreground">Select an organization</h2>
              <p className="text-sm text-muted-foreground">
                Node applications must be associated with an active organization.
              </p>
              <Button asChild size="sm" variant="outline">
                <Link to="/orgs">manage organizations</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {!nearAccountId && (
          <Card>
            <CardContent className="space-y-3 p-6">
              <h2 className="font-semibold text-foreground">Connect a NEAR account</h2>
              <p className="text-sm text-muted-foreground">
                The connected SIWN account becomes the applicant and future tenant owner.
              </p>
              <Button asChild size="sm" variant="outline">
                <Link to="/settings/auth-methods">manage sign-in methods</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <form
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <Card>
            <CardContent className="space-y-5 p-6">
              <div className="space-y-1">
                <h2 className="font-semibold text-foreground">Node details</h2>
                <p className="text-sm text-muted-foreground">
                  Choose where this node belongs and describe the location it represents.
                </p>
              </div>

              <form.Field name="kind">
                {(field) => (
                  <Field>
                    <FieldLabel>kind</FieldLabel>
                    <div className="flex flex-wrap gap-2">
                      {nodeApplicationKinds.map((kind) => (
                        <Button
                          key={kind}
                          type="button"
                          size="sm"
                          variant={field.state.value === kind ? "default" : "outline"}
                          onClick={() => {
                            field.handleChange(kind);
                            const parentId = kind === "country" ? null : rootParentId || null;
                            form.setFieldValue("parentId", parentId, { dontUpdateMeta: true });
                          }}
                        >
                          {kind}
                        </Button>
                      ))}
                    </div>
                  </Field>
                )}
              </form.Field>

              {formValues.kind !== "country" && (
                <form.Field name="parentId">
                  {(field) => {
                    const errors = field.state.meta.isTouched ? field.state.meta.errors : [];
                    return (
                      <div className="space-y-4">
                        <Field data-invalid={errors.length > 0 || undefined}>
                          <FieldLabel htmlFor="application-country">parent country</FieldLabel>
                          <Select
                            value={rootParentId}
                            onValueChange={(countryId) => {
                              setRootParentId(countryId);
                              field.handleChange(countryId);
                            }}
                          >
                            <SelectTrigger id="application-country" className="w-full">
                              <SelectValue placeholder="Select a country" />
                            </SelectTrigger>
                            <SelectContent>
                              {rootNodes.map((node) => (
                                <SelectItem key={node.id} value={node.id}>
                                  {node.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FieldError errors={errors} />
                        </Field>

                        {formValues.kind === "city" && rootParentId && (
                          <Field>
                            <FieldLabel htmlFor="application-state">parent state</FieldLabel>
                            <Select
                              value={
                                field.state.value === rootParentId
                                  ? DIRECT_COUNTRY_PARENT
                                  : (field.state.value ?? DIRECT_COUNTRY_PARENT)
                              }
                              onValueChange={(value) =>
                                field.handleChange(
                                  value === DIRECT_COUNTRY_PARENT ? rootParentId : value,
                                )
                              }
                            >
                              <SelectTrigger id="application-state" className="w-full">
                                <SelectValue
                                  placeholder={statesLoading ? "Loading states…" : "Select a state"}
                                />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={DIRECT_COUNTRY_PARENT}>
                                  Directly under country
                                </SelectItem>
                                {stateNodes
                                  .filter((node) => node.kind === "state")
                                  .map((node) => (
                                    <SelectItem key={node.id} value={node.id}>
                                      {node.name}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </Field>
                        )}
                      </div>
                    );
                  }}
                </form.Field>
              )}

              <form.Field name="name">
                {(field) => {
                  const errors = field.state.meta.isTouched ? field.state.meta.errors : [];
                  return (
                    <Field data-invalid={errors.length > 0 || undefined}>
                      <FieldLabel htmlFor="application-name">name</FieldLabel>
                      <Input
                        id="application-name"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => {
                          const nextName = event.target.value;
                          field.handleChange(nextName);
                          form.setFieldValue(
                            "slug",
                            deriveNodeApplicationSlug(
                              nextName,
                              form.state.values.slug,
                              slugManuallyEdited.current,
                            ),
                            { dontUpdateMeta: true },
                          );
                        }}
                        placeholder="Chicago"
                        aria-invalid={errors.length > 0 || undefined}
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
                      <FieldLabel htmlFor="application-slug">slug</FieldLabel>
                      <Input
                        id="application-slug"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => {
                          slugManuallyEdited.current = true;
                          field.handleChange(event.target.value.toLowerCase());
                        }}
                        placeholder="chicago"
                        pattern="[a-z0-9-]+"
                        aria-invalid={errors.length > 0 || undefined}
                      />
                      <FieldDescription>
                        {hostname || `your-node.${gatewayId}`}
                        {preflightLoading
                          ? " — checking availability…"
                          : preflight
                            ? preflight.hostname.available
                              ? " — available"
                              : " — unavailable"
                            : ""}
                      </FieldDescription>
                      <FieldError errors={errors} />
                    </Field>
                  );
                }}
              </form.Field>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-5 p-6">
              <h2 className="font-semibold text-foreground">Applicant</h2>
              <Field>
                <FieldLabel htmlFor="application-org">active organization</FieldLabel>
                <Input id="application-org" value={activeOrgId ?? ""} readOnly />
              </Field>
              <Field>
                <FieldLabel htmlFor="application-account">NEAR account</FieldLabel>
                <Input id="application-account" value={nearAccountId ?? ""} readOnly />
              </Field>
              <form.Field name="motivation">
                {(field) => {
                  const errors = field.state.meta.isTouched ? field.state.meta.errors : [];
                  return (
                    <Field data-invalid={errors.length > 0 || undefined}>
                      <FieldLabel htmlFor="application-motivation">motivation</FieldLabel>
                      <Textarea
                        id="application-motivation"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                        rows={6}
                        placeholder="Why do you want to operate this node, and how will it serve the local community?"
                        aria-invalid={errors.length > 0 || undefined}
                      />
                      <FieldError errors={errors} />
                    </Field>
                  );
                }}
              </form.Field>
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={!canSubmit}>
              <Send />
              {submitMutation.isPending ? "submitting…" : "submit for review"}
            </Button>
            {hostname && preflight && (
              <Badge variant={preflight.hostname.available ? "secondary" : "destructive"}>
                {preflight.hostname.available ? "hostname available" : "hostname unavailable"}
              </Badge>
            )}
          </div>
        </form>
      </div>
    </PageContainer>
  );
}
