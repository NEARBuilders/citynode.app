import { ArrowRightIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { pluginPath } from "@/app";
import { ConnectDao } from "@/components/connect-dao";
import { Button } from "@/components/ui/button";
import { useAppTranslation } from "@/i18n/runtime";

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
