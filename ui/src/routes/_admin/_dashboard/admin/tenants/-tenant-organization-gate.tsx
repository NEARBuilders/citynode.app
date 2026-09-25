import { BankIcon } from "@phosphor-icons/react";
import type { MutableRefObject } from "react";
import { Button, Card, CardContent, Field, FieldLabel, Input } from "@/components";
import { deriveSlug } from "@/lib/slug";

export function TenantOrganizationGate({
  orgName,
  orgSlug,
  orgSlugManuallyEdited,
  isPending,
  onOrgNameChange,
  onOrgSlugChange,
  onSubmit,
}: {
  orgName: string;
  orgSlug: string;
  orgSlugManuallyEdited: MutableRefObject<boolean>;
  isPending: boolean;
  onOrgNameChange: (value: string) => void;
  onOrgSlugChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center gap-2">
          <BankIcon className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Create an organization first</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Tenants belong to an organization. Create one to continue.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
          className="space-y-4"
        >
          <Field>
            <FieldLabel htmlFor="org-name">name</FieldLabel>
            <Input
              id="org-name"
              value={orgName}
              onChange={(event) => {
                const value = event.target.value;
                onOrgNameChange(value);
                onOrgSlugChange(deriveSlug(value, orgSlug, orgSlugManuallyEdited.current));
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
              onChange={(event) => {
                orgSlugManuallyEdited.current = true;
                onOrgSlugChange(event.target.value.replace(/[^a-z0-9-]/g, ""));
              }}
              placeholder="my-organization"
              pattern="[a-z0-9-]+"
              required
            />
          </Field>
          <Button type="submit" size="sm" disabled={isPending || !orgName || !orgSlug}>
            {isPending ? "creating…" : "create organization"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
