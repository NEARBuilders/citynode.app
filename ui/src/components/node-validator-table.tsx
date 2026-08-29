import type { InferClientOutputs } from "@orpc/client";
import type { ApiClient } from "@/app";
import { Badge } from "@/components/ui/badge";

type Validator = InferClientOutputs<ApiClient>["getNodeSummary"]["validators"][number];

export function NodeValidatorTable({ validators }: { validators: Validator[] }) {
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
              <td className="px-4 py-3">
                <Badge variant={validator.isDefault ? "default" : "outline"}>
                  {validator.isDefault ? "default" : "no"}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
