import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { getActiveRuntime } from "@/app";
import { Badge, Card, SectionHeader } from "@/components";
import type { Validator } from "../../../../../../../../api/src/contract";

export const Route = createFileRoute("/_layout/_authenticated/_dashboard/dashboard/node/")({
  component: NodeOverview,
});

function NodeOverview() {
  const { runtimeConfig, selectedNode, summary, stakingSourceNode } = Route.useRouteContext();
  if (!selectedNode || !summary) return null;

  const gateway = getActiveRuntime(runtimeConfig)?.gatewayId;
  const stakingIsInherited = summary.stakingValidators.sourceNodeId !== selectedNode.id;

  return (
    <div className="space-y-8">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Direct children" value={summary.childrenCount} />
        <StatCard label="Subtree nodes" value={summary.subtreeNodeCount} />
        <StatCard label="Validators" value={summary.validators.length} />
        <StatCard label="Subtree validators" value={summary.subtreeValidatorCount} />
      </section>

      <section className="space-y-3">
        <SectionHeader title="Validators" />
        <Card className="overflow-hidden">
          {summary.validators.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">This node has no validators.</p>
          ) : (
            <ValidatorTable validators={summary.validators} />
          )}
        </Card>
      </section>

      <section className="space-y-3">
        <SectionHeader title="Direct children" />
        {summary.children.length === 0 ? (
          <Card className="p-6 text-sm text-muted-foreground">
            This node has no direct children.
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {summary.children.map((child) => {
              const childUrl = gateway ? `https://${child.slug}.${gateway}` : null;
              return (
                <Card key={child.id} className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-foreground">{child.name}</h3>
                      <p className="font-mono text-xs text-muted-foreground">{child.slug}</p>
                    </div>
                    <Badge variant="outline">{child.kind}</Badge>
                  </div>
                  {childUrl && (
                    <a
                      href={childUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:underline"
                    >
                      {child.slug}.{gateway}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeader title="Staking resolution" />
        <Card className="space-y-4 p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={stakingIsInherited ? "secondary" : "default"}>
              {stakingIsInherited ? "inherited" : "own validators"}
            </Badge>
            <p className="text-sm text-muted-foreground">
              {stakingIsInherited
                ? `Staking resolves to ${stakingSourceNode?.name ?? "an ancestor node"}.`
                : "Staking resolves to this node's validators."}
            </p>
          </div>
          {summary.stakingValidators.validators.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No validators are available for staking on this node or its ancestors.
            </p>
          ) : (
            <div className="-mx-6 -mb-6 border-t border-border">
              <ValidatorTable validators={summary.stakingValidators.validators} />
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}

function ValidatorTable({ validators }: { validators: Validator[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-semibold">Account</th>
            <th className="px-4 py-3 font-semibold">Network</th>
            <th className="px-4 py-3 font-semibold">Protocol</th>
            <th className="px-4 py-3 font-semibold">Role</th>
            <th className="px-4 py-3 font-semibold">Default</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {validators.map((validator) => (
            <tr key={validator.id}>
              <td className="px-4 py-3 font-mono text-xs text-foreground">{validator.accountId}</td>
              <td className="px-4 py-3 text-muted-foreground">{validator.network}</td>
              <td className="px-4 py-3 text-muted-foreground">{validator.protocol}</td>
              <td className="px-4 py-3">
                <Badge variant="outline">{validator.role}</Badge>
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {validator.isDefault ? "yes" : "no"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="space-y-1 p-4">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-2xl font-semibold text-foreground">{value}</div>
    </Card>
  );
}
