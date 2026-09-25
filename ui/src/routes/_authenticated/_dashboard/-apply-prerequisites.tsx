import { Link } from "@tanstack/react-router";
import { pluginPath } from "@/app";
import { Button, Card, CardContent } from "@/components";
import { ConnectDao } from "@/components/connect-dao";

export function ApplyPrerequisites({
  displayedOrgId,
  nearAccountId,
  onDaoVerified,
}: {
  displayedOrgId: string | null;
  nearAccountId: string | null;
  onDaoVerified: (value: { daoAccountId: string }) => void;
}) {
  return (
    <>
      {!displayedOrgId && (
        <Card>
          <CardContent className="space-y-3 p-6">
            <h2 className="font-semibold text-foreground">Select an organization</h2>
            <p className="text-sm text-muted-foreground">
              Node applications must be associated with an active organization.
            </p>
            <Button size="sm" variant="outline" nativeButton={false} render={<Link to="/orgs" />}>
              manage organizations
            </Button>
          </CardContent>
        </Card>
      )}

      {!nearAccountId && (
        <Card>
          <CardContent className="space-y-3 p-6">
            <h2 className="font-semibold text-foreground">Connect a NEAR account</h2>
            <p className="text-sm text-muted-foreground">
              The connected SIWN account identifies the applicant. The tenant itself is owned by the
              DAO connected through Trezu.
            </p>
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<Link to={pluginPath("/settings/auth-methods")} />}
            >
              manage sign-in methods
            </Button>
          </CardContent>
        </Card>
      )}

      <ConnectDao onVerified={onDaoVerified} />
    </>
  );
}
