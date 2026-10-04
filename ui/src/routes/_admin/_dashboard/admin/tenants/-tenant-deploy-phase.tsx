import { ArrowRightIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { Trans } from "everything-dev/ui/i18n";
import { Button, PageHeader, type Step } from "@/components";
import { ConnectDao } from "@/components/connect-dao";
import { Spinner } from "@/components/ui/spinner";
import { useAppTranslation } from "@/i18n/runtime";
import { TenantStep } from "./-tenant-step";
import { resolveTenantDeploySteps } from "./-tenant-wizard";

export function TenantDeployPhase({
  steps,
  verifyState,
  verifyMessage,
  hostname,
  daoAccountId,
  createdTenantId,
  tenantSlug,
  publishPending,
  allDone,
  onRecheck,
  onSubmitPublish,
  onResetPublish,
}: {
  steps: Step[];
  verifyState: "idle" | "checking" | "verified" | "failed";
  verifyMessage: string | null;
  hostname: string;
  daoAccountId: string | null;
  createdTenantId: string | null;
  tenantSlug: string;
  publishPending: boolean;
  allDone: boolean;
  onRecheck: () => void;
  onSubmitPublish: () => void;
  onResetPublish: () => void;
}) {
  const translate = useAppTranslation();
  const createStep = steps[0];
  const publishStep = steps[1];
  const status = resolveTenantDeploySteps({
    create: createStep?.state ?? translate("common.pendingLower"),
    publish: publishStep?.state ?? translate("common.pendingLower"),
    verified: verifyState === "verified",
  });
  const live = verifyState === "verified";
  const tenantLink = createdTenantId ? (
    <Link to="/tenant/$tenantId" params={{ tenantId: tenantSlug || createdTenantId }} />
  ) : null;

  return (
    <>
      <PageHeader
        title={
          live
            ? translate("admin.site.live")
            : allDone
              ? translate("admin.site.waitingDao")
              : translate("admin.site.finish")
        }
        subtitle={hostname}
        headerTestId="admin-tenant-deploy.heading"
      />

      <ol className="flex flex-col" data-testid="admin-tenant-deploy-steps">
        <TenantStep
          id="deploy-create"
          number={1}
          title={translate("admin.site.createStep")}
          status={status.create}
          summary={translate("admin.recordsCreated")}
        >
          {createStep?.error && (
            <p role="alert" className="text-sm break-all text-destructive">
              {createStep.error}
            </p>
          )}
        </TenantStep>

        <TenantStep
          id="deploy-publish"
          number={2}
          title={translate("admin.site.publishStep")}
          status={status.publish}
          summary={
            daoAccountId
              ? translate("admin.submittedNamed", { account: daoAccountId ?? "" })
              : translate("common.submitted")
          }
        >
          <div className="flex max-w-xl flex-col gap-4">
            {publishStep?.state === "pending" && (
              <>
                <ConnectDao purpose="tenant-deploy" />
                <Button
                  className="w-full sm:w-auto sm:self-start"
                  onClick={onSubmitPublish}
                  disabled={publishPending || !daoAccountId}
                  data-testid="admin-tenant-publish"
                >
                  {translate("admin.site.publish")}
                </Button>
              </>
            )}
            {publishStep?.state === "running" && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner />
                {translate("admin.site.waitingWallet")}
              </p>
            )}
            {publishStep?.state === "failed" && (
              <>
                {publishStep.error && (
                  <p role="alert" className="text-sm break-all text-destructive">
                    {publishStep.error}
                  </p>
                )}
                <Button
                  variant="outline"
                  className="w-full sm:w-auto sm:self-start"
                  onClick={onResetPublish}
                >
                  {translate("admin.site.retryPublish")}
                </Button>
              </>
            )}
          </div>
        </TenantStep>

        <TenantStep
          id="deploy-live"
          number={3}
          title={translate("admin.site.approveTrezu")}
          status={status.live}
          summary={translate("admin.liveNamed", { hostname: hostname ?? "" })}
          last
        >
          <div className="flex max-w-xl flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              <Trans
                id="admin.signInApprove"
                values={{ account: daoAccountId ?? "" }}
                components={{ account: <span className="font-mono break-all text-foreground" /> }}
              />
            </p>
            {verifyMessage && verifyState !== "verified" && (
              <p
                className="text-sm text-muted-foreground"
                data-testid="admin-tenant-verify-message"
              >
                {verifyMessage}
              </p>
            )}
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <Button
                onClick={onRecheck}
                disabled={verifyState === "checking"}
                data-testid="admin-tenant-recheck"
              >
                {verifyState === "checking"
                  ? translate("common.checking")
                  : translate("common.checkAgain")}
              </Button>
              <Button variant="ghost" onClick={onResetPublish}>
                {translate("admin.site.submitAgain")}
              </Button>
            </div>
          </div>
        </TenantStep>
      </ol>

      {live && tenantLink && (
        <div className="flex flex-col gap-4" data-testid="admin-tenant-live">
          <p className="text-base text-foreground">
            {translate("admin.tenantDeployedNamed", { hostname })}
          </p>
          <Button
            className="w-full sm:w-auto sm:self-start"
            nativeButton={false}
            render={tenantLink}
          >
            {translate("admin.site.openSettings")}
            <ArrowRightIcon />
          </Button>
        </div>
      )}

      {!live && tenantLink && status.create === "complete" && (
        <Button
          variant="ghost"
          className="w-full sm:w-auto sm:self-start"
          nativeButton={false}
          render={tenantLink}
        >
          {translate("admin.site.finishLater")}
        </Button>
      )}
    </>
  );
}
