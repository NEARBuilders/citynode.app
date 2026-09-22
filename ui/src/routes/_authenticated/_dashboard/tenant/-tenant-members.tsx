import { Link } from "@tanstack/react-router";
import { Users } from "lucide-react";
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
          <Button asChild variant="outline" size="sm">
            <Link to="/orgs/$slug" params={{ slug: orgSlug }}>
              <Users className="h-3.5 w-3.5" />
              open organization
            </Link>
          </Button>
        )}
      </Card>
    </section>
  );
}
