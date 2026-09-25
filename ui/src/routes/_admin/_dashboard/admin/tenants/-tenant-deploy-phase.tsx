import { ArrowRightIcon, CheckCircleIcon, SparkleIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { Button, Card, CardContent, PageHeader, type Step, StepList } from "@/components";
import { ConnectDao } from "@/components/connect-dao";

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
  const hasFailure = steps.some((step) => step.state === "failed");
  const publishStep = steps[1];

  return (
    <div className="space-y-8">
      <PageHeader
        icon={SparkleIcon}
        label="Deploying"
        title={allDone ? "Deployment complete" : "Deploying tenant…"}
      />

      <ConnectDao />

      <Card>
        <CardContent className="p-6 space-y-6">
          <StepList steps={steps} />

          {publishStep?.state === "success" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Transaction submitted as <code className="font-mono text-xs">{daoAccountId}</code>.
                Trezu multiplexes the call into your DAO&apos;s internal proposal — sign in to
                trezu.app to confirm or wait for council approval.
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
                  onClick={onRecheck}
                  disabled={verifyState === "checking"}
                >
                  {verifyState === "checking" ? "rechecking…" : "recheck publish"}
                </Button>
                <Button size="sm" variant="outline" onClick={onResetPublish}>
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
              <Button variant="outline" size="sm" onClick={onResetPublish}>
                retry publish
              </Button>
            </div>
          )}

          {publishStep?.state === "pending" && (
            <Button size="sm" onClick={onSubmitPublish} disabled={publishPending}>
              publish config via DAO
            </Button>
          )}

          {verifyState === "verified" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-foreground">
                <CheckCircleIcon className="h-4 w-4 text-green-500" />
                Tenant deployed at <code className="font-mono text-xs">{hostname}</code>
              </div>
              {createdTenantId && (
                <Button
                  size="sm"
                  nativeButton={false}
                  render={
                    <Link
                      to="/tenant/$tenantId"
                      params={{ tenantId: tenantSlug || createdTenantId }}
                    />
                  }
                >
                  open tenant
                  <ArrowRightIcon className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )}

          {hasFailure && !verifyState && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Some steps failed. API records were created — you can retry on-chain steps from the
                tenant detail page.
              </p>
              {createdTenantId && (
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={
                    <Link
                      to="/tenant/$tenantId"
                      params={{ tenantId: tenantSlug || createdTenantId }}
                    />
                  }
                >
                  go to tenant
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
