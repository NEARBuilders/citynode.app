import { Card, CardContent, Field, FieldError, FieldLabel, Input, Textarea } from "@/components";
import type { ApplicationForm } from "./-apply-form";

export function ApplyApplicantFields({
  activeOrganizationLabel,
  daoAccountId,
  form,
  nearAccountId,
  activatingOrganization,
}: {
  activeOrganizationLabel: string;
  daoAccountId: string | null;
  form: ApplicationForm;
  nearAccountId: string | null;
  activatingOrganization: boolean;
}) {
  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <h2 className="font-semibold text-foreground">Applicant</h2>
        <Field>
          <FieldLabel htmlFor="application-org">active organization</FieldLabel>
          <Input id="application-org" value={activeOrganizationLabel} readOnly />
          {activatingOrganization && (
            <p className="text-sm text-muted-foreground">Activating this organization…</p>
          )}
        </Field>
        <Field>
          <FieldLabel htmlFor="application-account">NEAR account</FieldLabel>
          <Input id="application-account" value={nearAccountId ?? ""} readOnly />
        </Field>
        <Field>
          <FieldLabel htmlFor="application-dao-account">tenant DAO account</FieldLabel>
          <Input id="application-dao-account" value={daoAccountId ?? ""} readOnly />
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
  );
}
