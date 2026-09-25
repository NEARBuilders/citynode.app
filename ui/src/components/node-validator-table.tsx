import type { InferClientOutputs } from "@orpc/client";
import type { ReactNode } from "react";
import type { ApiClient } from "@/app";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Validator = InferClientOutputs<ApiClient>["getNodeSummary"]["validators"][number];

export function NodeValidatorTable({
  validators,
  renderActions,
}: {
  validators: Validator[];
  renderActions?: (validator: Validator) => ReactNode;
}) {
  return (
    <Table className="min-w-180">
      <TableHeader>
        <TableRow>
          <TableHead>Account</TableHead>
          <TableHead>Network</TableHead>
          <TableHead>Protocol</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Default</TableHead>
          {renderActions && <TableHead>Actions</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {validators.map((validator) => (
          <TableRow key={validator.id}>
            <TableCell>
              <span className="font-mono text-xs">{validator.accountId}</span>
            </TableCell>
            <TableCell>
              <span className="text-muted-foreground">{validator.network}</span>
            </TableCell>
            <TableCell>
              <span className="text-muted-foreground">{validator.protocol}</span>
            </TableCell>
            <TableCell>
              <Badge variant="outline">{validator.role}</Badge>
            </TableCell>
            <TableCell>
              <Badge variant={validator.isDefault ? "default" : "outline"}>
                {validator.isDefault ? "default" : "no"}
              </Badge>
            </TableCell>
            {renderActions && <TableCell>{renderActions(validator)}</TableCell>}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
