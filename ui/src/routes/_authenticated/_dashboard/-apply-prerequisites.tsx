import { ArrowRightIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { pluginPath } from "@/app";
import { ConnectDao } from "@/components/connect-dao";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useAppTranslation } from "@/i18n/runtime";
import { ApplyCreateOrganization } from "./-apply-create-organization";
import { isApprovedOrganization } from "./-node-application";

type OrganizationOption = { id: string; name: string; status?: string | null };

export function ApplyOrganizationStep({
  organizations,
  displayedOrgId,
  activating,
  switching,
  onSwitch,
  onContinue,
}: {
  organizations: OrganizationOption[];
  displayedOrgId: string | null;
  activating: boolean;
  switching: boolean;
  onSwitch: (organizationId: string) => void;
  onContinue: () => void;
}) {
  const t = useAppTranslation();
  if (activating) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner />
        {t("apply.organization.activating")}
      </p>
    );
  }
  const approved = organizations.filter(isApprovedOrganization);
  const waiting = organizations.find((organization) => organization.status === "pending");
  if (approved.length === 0 && waiting) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="apply.org-waiting">
        {t("apply.organization.waiting", { name: waiting.name })}
      </p>
    );
  }
  if (approved.length === 0) {
    return <ApplyCreateOrganization />;
  }
  return (
    <div className="flex flex-col gap-4">
      <Field className="sm:max-w-sm">
        <FieldLabel htmlFor="apply-organization">{t("apply.organization.as")}</FieldLabel>
        <Select
          items={approved.map((organization) => ({
            label: organization.name,
            value: organization.id,
          }))}
          value={displayedOrgId}
          onValueChange={(organizationId) => {
            if (organizationId && organizationId !== displayedOrgId) onSwitch(organizationId);
          }}
          disabled={switching}
        >
          <SelectTrigger id="apply-organization" className="w-full" data-testid="apply.org-select">
            <SelectValue placeholder={t("apply.organization.choose")} />
          </SelectTrigger>
          <SelectContent>
            {approved.map((organization) => (
              <SelectItem key={organization.id} value={organization.id}>
                {organization.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {displayedOrgId && (
          <Button type="button" onClick={onContinue} disabled={switching}>
            {t("apply.organization.continue")}
          </Button>
        )}
        <Button variant="ghost" nativeButton={false} render={<Link to="/orgs" />}>
          {t("apply.organization.manage")}
        </Button>
      </div>
    </div>
  );
}

export function ApplyNearStep() {
  const t = useAppTranslation();
  return (
    <div className="flex flex-col items-start gap-4">
      <p className="text-sm text-muted-foreground">{t("apply.near.description")}</p>
      <Button
        className="w-full sm:w-auto"
        nativeButton={false}
        render={<Link to={pluginPath("/settings/auth-methods")} />}
        data-testid="apply.link-near"
      >
        {t("apply.near.link")}
        <ArrowRightIcon data-icon="inline-end" />
      </Button>
    </div>
  );
}

export function ApplyDaoStep({
  verified,
  onDaoVerified,
  onContinue,
}: {
  verified: boolean;
  onDaoVerified: (value: { daoAccountId: string }) => void;
  onContinue: () => void;
}) {
  const t = useAppTranslation();
  return (
    <div className="flex flex-col items-start gap-4">
      <div
        className="flex flex-col gap-2 text-sm text-muted-foreground"
        data-testid="apply.dao-explainer"
      >
        <p>{t("apply.dao.what")}</p>
        <p>
          {t("apply.dao.none")}{" "}
          <a
            className="text-foreground underline underline-offset-4"
            href="https://trezu.app/create"
            target="_blank"
            rel="noopener noreferrer"
            data-testid="apply.dao-create"
          >
            {t("apply.dao.create")}
          </a>
        </p>
      </div>
      <div className="w-full">
        <ConnectDao onVerified={onDaoVerified} purpose="apply" variant="plain" />
      </div>
      {verified && (
        <Button
          type="button"
          className="w-full sm:w-auto"
          onClick={onContinue}
          data-testid="apply.dao-continue"
        >
          {t("apply.organization.continue")}
        </Button>
      )}
    </div>
  );
}
