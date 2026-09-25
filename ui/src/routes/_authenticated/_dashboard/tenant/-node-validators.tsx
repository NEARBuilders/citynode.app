import { CheckCircleIcon, PlusIcon, ShieldCheckIcon, TrashIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useApiClient } from "@/app";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Field,
  FieldLabel,
  Input,
  SectionHeader,
} from "@/components";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { fetchPoolOwner } from "@/lib/pool-owner";
import {
  invalidateNodeQueries,
  nodeValidatorsQueryOptions,
  tenantNodesQueryOptions,
} from "@/lib/queries/nodes";

interface TenantNodeValidatorsProps {
  tenantId: string;
  canManage: boolean;
}

const VALIDATOR_ROLE_ITEMS = [
  { label: "official", value: "official" },
  { label: "community", value: "community" },
];

function toValidatorRole(value: string | null): ValidatorRow["role"] | null {
  return value === "official" || value === "community" ? value : null;
}

function ValidatorRoleSelect({
  value,
  onChange,
  id,
  ariaLabel,
}: {
  value: ValidatorRow["role"];
  onChange: (role: ValidatorRow["role"]) => void;
  id?: string;
  ariaLabel: string;
}) {
  return (
    <Select
      value={value}
      items={VALIDATOR_ROLE_ITEMS}
      onValueChange={(next) => {
        const role = toValidatorRole(next);
        if (role) onChange(role);
      }}
    >
      <SelectTrigger id={id} size="sm" aria-label={ariaLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {VALIDATOR_ROLE_ITEMS.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface ValidatorRow {
  id: string;
  nodeId: string;
  accountId: string;
  network: string;
  protocol: string;
  role: "official" | "community";
  isDefault: boolean;
}

function PoolOwnerBadge({ poolAccountId, network }: { poolAccountId: string; network: string }) {
  const { data: owner, isLoading } = useQuery({
    queryKey: ["pool-owner", network, poolAccountId],
    queryFn: () => fetchPoolOwner(poolAccountId, network),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <span className="text-xs text-muted-foreground" title="reading owner_id() on-chain">
        owner: …
      </span>
    );
  }

  if (!owner) {
    return (
      <span
        className="text-xs text-muted-foreground"
        title="account is not a staking pool contract"
      >
        owner: unknown
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1 text-xs text-muted-foreground"
      title="verified via owner_id() on-chain"
    >
      <ShieldCheckIcon className="h-3 w-3 text-success" />
      owner: <code className="font-mono">{owner}</code>
    </span>
  );
}

function NodeSection({ nodeId, canManage }: { nodeId: string; canManage: boolean }) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const [newAccountId, setNewAccountId] = useState("");
  const [newRole, setNewRole] = useState<"official" | "community">("community");

  const { data: validators = [] } = useQuery({
    ...nodeValidatorsQueryOptions(apiClient, nodeId),
    select: (rows) => rows as ValidatorRow[],
  });

  const invalidate = () => invalidateNodeQueries(queryClient);

  const createMutation = useMutation({
    mutationFn: async () => {
      return apiClient.createValidator({
        nodeId,
        accountId: newAccountId.trim(),
        role: newRole,
      });
    },
    onSuccess: () => {
      toast.success("Validator added");
      setNewAccountId("");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || "Failed to add validator"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (validatorId: string) => apiClient.deleteValidator({ validatorId }),
    onSuccess: () => {
      toast.success("Validator removed");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || "Failed to remove validator"),
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (validatorId: string) => apiClient.setDefaultValidator({ validatorId }),
    onSuccess: () => {
      toast.success("Default validator updated");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || "Failed to set default validator"),
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({
      validatorId,
      role,
    }: {
      validatorId: string;
      role: ValidatorRow["role"];
    }) => apiClient.updateValidator({ validatorId, role }),
    onSuccess: () => {
      toast.success("Validator updated");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || "Failed to update validator"),
  });

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        {validators.length === 0 ? (
          <p className="text-sm text-muted-foreground">No validators attached to this node yet.</p>
        ) : (
          <Table>
            <TableBody>
              {validators.map((validator) => (
                <TableRow key={validator.id}>
                  <TableCell>
                    <code className="font-mono text-xs text-foreground">{validator.accountId}</code>
                  </TableCell>
                  <TableCell>
                    <PoolOwnerBadge
                      poolAccountId={validator.accountId}
                      network={validator.network}
                    />
                  </TableCell>
                  <TableCell>
                    {canManage ? (
                      <ValidatorRoleSelect
                        value={validator.role}
                        ariaLabel="validator role"
                        onChange={(role) =>
                          updateRoleMutation.mutate({ validatorId: validator.id, role })
                        }
                      />
                    ) : (
                      <Badge variant="secondary">{validator.role}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {validator.isDefault && <Badge variant="outline">default</Badge>}
                      {canManage && (
                        <>
                          {!validator.isDefault && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setDefaultMutation.mutate(validator.id)}
                              disabled={setDefaultMutation.isPending}
                            >
                              make default
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => deleteMutation.mutate(validator.id)}
                            disabled={deleteMutation.isPending}
                            aria-label="remove validator"
                          >
                            <TrashIcon className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {canManage && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newAccountId.trim()) return;
              createMutation.mutate();
            }}
            className="flex items-center gap-2"
          >
            <Field className="max-w-xs">
              <FieldLabel htmlFor="new-validator-account" className="sr-only">
                Validator account
              </FieldLabel>
              <Input
                id="new-validator-account"
                value={newAccountId}
                onChange={(e) => setNewAccountId(e.target.value)}
                placeholder="everything.pool.near"
                className="font-mono"
                required
              />
            </Field>
            <Field className="w-auto">
              <FieldLabel htmlFor="new-validator-role" className="sr-only">
                Role
              </FieldLabel>
              <ValidatorRoleSelect
                id="new-validator-role"
                value={newRole}
                ariaLabel="new validator role"
                onChange={setNewRole}
              />
            </Field>
            <Button
              type="submit"
              size="sm"
              disabled={createMutation.isPending || !newAccountId.trim()}
            >
              <PlusIcon className="h-3.5 w-3.5" />
              add validator
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export function TenantNodeValidators({ tenantId, canManage }: TenantNodeValidatorsProps) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const [renamingNodeId, setRenamingNodeId] = useState<string | null>(null);
  const [nodeName, setNodeName] = useState("");

  const { data: nodes = [] } = useQuery({
    ...tenantNodesQueryOptions(apiClient, tenantId),
    enabled: !!tenantId,
  });

  const renameMutation = useMutation({
    mutationFn: async ({ nodeId, name }: { nodeId: string; name: string }) =>
      apiClient.updateNode({ nodeId, name }),
    onSuccess: () => {
      toast.success("Node renamed");
      setRenamingNodeId(null);
      invalidateNodeQueries(queryClient);
    },
    onError: (error: Error) => toast.error(error.message || "Failed to rename node"),
  });

  if (nodes.length === 0) {
    return (
      <section className="space-y-3">
        <SectionHeader title="Node & validators" />
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">
              No geographic node is attached to this tenant yet.
            </p>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <SectionHeader title="Node & validators" />
      <div className="space-y-4">
        {nodes.map((node) => (
          <div key={node.id} className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{node.kind}</Badge>
              {renamingNodeId === node.id ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!nodeName.trim()) return;
                    renameMutation.mutate({ nodeId: node.id, name: nodeName.trim() });
                  }}
                  className="flex items-center gap-2"
                >
                  <Field className="max-w-xs">
                    <FieldLabel htmlFor={`node-name-${node.id}`} className="sr-only">
                      Node name
                    </FieldLabel>
                    <Input
                      id={`node-name-${node.id}`}
                      value={nodeName}
                      onChange={(e) => setNodeName(e.target.value)}
                      autoFocus
                    />
                  </Field>
                  <Button type="submit" size="sm" disabled={renameMutation.isPending}>
                    <CheckCircleIcon className="h-3.5 w-3.5" />
                    save
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setRenamingNodeId(null)}
                  >
                    cancel
                  </Button>
                </form>
              ) : (
                <>
                  <span className="text-sm font-semibold text-foreground">{node.name}</span>
                  <code className="font-mono text-xs text-muted-foreground">{node.slug}</code>
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setNodeName(node.name);
                        setRenamingNodeId(node.id);
                      }}
                    >
                      rename
                    </Button>
                  )}
                </>
              )}
            </div>
            <NodeSection nodeId={node.id} canManage={canManage} />
          </div>
        ))}
      </div>
    </section>
  );
}
