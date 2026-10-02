import type { MutableRefObject } from "react";
import { Button, Field, FieldLabel, Input } from "@/components";
import { FieldDescription, FieldGroup } from "@/components/ui/field";
import { useAppTranslation } from "@/i18n/runtime";
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
  const translate = useAppTranslation();
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="flex max-w-xl flex-col gap-6"
      data-testid="admin-tenant-org-gate"
    >
      <p className="text-sm text-muted-foreground">
        {translate("orgApproval.siteRequiresApproval")}
      </p>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="org-name">{translate("org.name")}</FieldLabel>
          <Input
            id="org-name"
            value={orgName}
            onChange={(event) => {
              const value = event.target.value;
              onOrgNameChange(value);
              onOrgSlugChange(deriveSlug(value, orgSlug, orgSlugManuallyEdited.current));
            }}
            placeholder={translate("admin.site.orgExample")}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="org-slug">{translate("admin.site.orgSlug")}</FieldLabel>
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
            className="font-mono"
          />
          <FieldDescription>{translate("admin.site.slugHint")}</FieldDescription>
        </Field>
      </FieldGroup>
      <Button
        type="submit"
        className="w-full sm:w-auto sm:self-start"
        disabled={isPending || !orgName || !orgSlug}
      >
        {isPending ? translate("apply.submit.pending") : translate("orgApproval.request")}
      </Button>
    </form>
  );
}
