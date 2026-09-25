import {
  Card,
  CardContent,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
} from "@/components";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { deriveSlug } from "@/lib/slug";
import type { ApplicationForm } from "./-apply-form";
import type { NodeApplicationValues } from "./-node-application";
import { nodeApplicationKinds } from "./-node-application";

const DIRECT_COUNTRY_PARENT = "__direct-country__";

type NodeOption = { id: string; name: string; kind: string };

export function ApplyNodeFields({
  form,
  formValues,
  gatewayId,
  hostname,
  preflight,
  preflightLoading,
  rootNodes,
  rootParentId,
  setRootParentId,
  slugManuallyEdited,
  stateNodes,
  statesLoading,
}: {
  form: ApplicationForm;
  formValues: NodeApplicationValues;
  gatewayId: string;
  hostname: string;
  preflight: { hostname: { available: boolean } } | undefined;
  preflightLoading: boolean;
  rootNodes: NodeOption[];
  rootParentId: string;
  setRootParentId: (value: string) => void;
  slugManuallyEdited: { current: boolean };
  stateNodes: NodeOption[];
  statesLoading: boolean;
}) {
  return (
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
                      items={rootNodes.map((node) => ({ label: node.name, value: node.id }))}
                      value={rootParentId || null}
                      onValueChange={(countryId) => {
                        if (countryId === null) return;
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
                        items={[
                          { label: "Directly under country", value: DIRECT_COUNTRY_PARENT },
                          ...stateNodes
                            .filter((node) => node.kind === "state")
                            .map((node) => ({ label: node.name, value: node.id })),
                        ]}
                        onValueChange={(value) => {
                          if (value === null) return;
                          field.handleChange(
                            value === DIRECT_COUNTRY_PARENT ? rootParentId : value,
                          );
                        }}
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
                      deriveSlug(nextName, form.getFieldValue("slug"), slugManuallyEdited.current),
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
                  className="font-mono"
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
  );
}
