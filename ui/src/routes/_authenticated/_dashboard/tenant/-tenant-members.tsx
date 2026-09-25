import { UsersIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { Button, Card, SectionHeader } from "@/components";

export function TenantMembers({ orgSlug }: { orgSlug: string | null }) {
  return (
    <section className="space-y-3">
      <SectionHeader title="Members & permissions" />
      <Card className="p-4 space-y-3">
        <p className="text-sm text-muted-foreground">
          This tenant is backed by an organization. Manage members, roles, and invitations there.
        </p>
        {orgSlug && (
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link to="/orgs/$slug" params={{ slug: orgSlug }} />}
          >
            <UsersIcon className="h-3.5 w-3.5" />
            open organization
          </Button>
        )}
      </Card>
    </section>
  );
}
