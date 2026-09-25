import { GlobeIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { FormEvent, MutableRefObject } from "react";
import type { ApiClient } from "@/app";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Field,
  FieldError,
  FieldLabel,
  Input,
} from "@/components";
import { ConnectDao } from "@/components/connect-dao";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TenantWizardForm } from "./-tenant-form";
import { deriveTenantWizardNameFields, type NodeKind, nodeKinds } from "./-tenant-wizard";

type Node = Awaited<ReturnType<ApiClient["listRootNodes"]>>[number];
type BindingPreflight = Awaited<ReturnType<ApiClient["bindingPreflight"]>>;

const DIRECT_COUNTRY_PARENT = "__direct-country__";

export function TenantCreationForm({
  form,
  kind,
  rootNodes,
  stateNodes,
  rootParentId,
  setRootParentId,
  slugManuallyEdited,
  tenantNameManuallyEdited,
  baseAccount,
  hostname,
  preflight,
  daoAccountId,
  submitPending,
  canSubmitDuringForm,
  onSubmit,
}: {
  form: TenantWizardForm;
  kind: NodeKind;
  rootNodes: Node[];
  stateNodes: Node[];
  rootParentId: string;
  setRootParentId: (value: string) => void;
  slugManuallyEdited: MutableRefObject<boolean>;
  tenantNameManuallyEdited: MutableRefObject<boolean>;
  baseAccount: string;
  hostname: string;
  preflight: BindingPreflight | undefined;
  daoAccountId: string | null;
  submitPending: boolean;
  canSubmitDuringForm: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-6">
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
                        items={rootNodes.map((node) => ({
                          label: `${node.name} (${node.slug})`,
                          value: node.id,
                        }))}
                        onValueChange={(value) => {
                          if (value === null) return;
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
                          items={[
                            { label: "directly under country", value: DIRECT_COUNTRY_PARENT },
                            ...stateNodes.map((node) => ({
                              label: `${node.name} (${node.slug})`,
                              value: node.id,
                            })),
                          ]}
                          onValueChange={(value) => {
                            if (value === null) return;
                            field.handleChange(
                              value === DIRECT_COUNTRY_PARENT ? rootParentId : value,
                            );
                          }}
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
                    onChange={(event) => {
                      const value = event.target.value;
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
                        form.setFieldValue("slug", derived.slug, { dontUpdateMeta: true });
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
                    onChange={(event) => {
                      slugManuallyEdited.current = true;
                      field.setMeta((meta) => ({ ...meta, isTouched: true }));
                      field.handleChange(event.target.value.replace(/[^a-z0-9-]/g, ""));
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
                    onChange={(event) => {
                      tenantNameManuallyEdited.current = true;
                      field.setMeta((meta) => ({ ...meta, isTouched: true }));
                      field.handleChange(event.target.value);
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
              value={daoAccountId ?? ""}
              readOnly
              placeholder="connect a DAO account to set the tenant account id"
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
              <GlobeIcon className="h-4 w-4 text-muted-foreground" />
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
        <Button variant="outline" nativeButton={false} render={<Link to="/admin/tenants" />}>
          cancel
        </Button>
        <form.Subscribe selector={(state) => state.canSubmit}>
          {(canSubmit) => (
            <Button type="submit" disabled={submitPending || !canSubmit || !canSubmitDuringForm}>
              {submitPending ? "creating…" : "create tenant + node"}
            </Button>
          )}
        </form.Subscribe>
      </div>
    </form>
  );
}
