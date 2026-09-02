import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useApiClient } from "@/app";
import { Badge, Button, Card, CardContent, Input, SectionHeader } from "@/components";
import { fetchPoolOwner } from "@/lib/pool-owner";

interface TenantNodeValidatorsProps {
  tenantId: string;
  canManage: boolean;
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
      <span className="text-[10px] text-muted-foreground" title="reading owner_id() on-chain">
        owner: …
      </span>
    );
  }

  if (!owner) {
    return (
      <span
        className="text-[10px] text-muted-foreground"
        title="account is not a staking pool contract"
      >
        owner: unknown
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
      title="verified via owner_id() on-chain"
    >
      <ShieldCheck className="h-3 w-3 text-green-500" />
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
    queryKey: ["validators", nodeId],
    queryFn: async () => {
      const rows = await apiClient.listValidatorsByNode({ nodeId });
      return rows as ValidatorRow[];
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["validators", nodeId] });

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
      <CardContent className="p-4 space-y-3">
        {validators.length === 0 ? (
          <p className="text-sm text-muted-foreground">No validators attached to this node yet.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {validators.map((validator) => (
                <tr key={validator.id} className="border-b border-border last:border-0">
                  <td className="py-2 pr-3">
                    <code className="font-mono text-xs text-foreground">{validator.accountId}</code>
                  </td>
                  <td className="py-2 pr-3">
                    <PoolOwnerBadge
                      poolAccountId={validator.accountId}
                      network={validator.network}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    {canManage ? (
                      <select
                        value={validator.role}
                        onChange={(e) =>
                          updateRoleMutation.mutate({
                            validatorId: validator.id,
                            role: e.target.value as ValidatorRow["role"],
                          })
                        }
                        className="h-7 rounded-[10px] border-2 border-outset border-border-strong bg-card px-2 text-xs text-foreground"
                        aria-label="validator role"
                      >
                        <option value="official">official</option>
                        <option value="community">community</option>
                      </select>
                    ) : (
                      <Badge variant="secondary" className="capitalize">
                        {validator.role}
                      </Badge>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right">
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
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
            <Input
              value={newAccountId}
              onChange={(e) => setNewAccountId(e.target.value)}
              placeholder="city-node-1.pool.near"
              className="max-w-xs font-mono text-xs"
              required
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as "official" | "community")}
              className="h-9 rounded-[10px] border-2 border-outset border-border-strong bg-card px-2 text-xs text-foreground"
              aria-label="new validator role"
            >
              <option value="official">official</option>
              <option value="community">community</option>
            </select>
            <Button
              type="submit"
              size="sm"
              disabled={createMutation.isPending || !newAccountId.trim()}
            >
              <Plus className="h-3.5 w-3.5" />
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
    queryKey: ["tenant-nodes", tenantId],
    queryFn: async () => apiClient.listNodes({ tenantId }),
    enabled: !!tenantId,
  });

  const renameMutation = useMutation({
    mutationFn: async ({ nodeId, name }: { nodeId: string; name: string }) =>
      apiClient.updateNode({ nodeId, name }),
    onSuccess: () => {
      toast.success("Node renamed");
      setRenamingNodeId(null);
      queryClient.invalidateQueries({ queryKey: ["tenant-nodes", tenantId] });
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
              <Badge variant="secondary" className="capitalize">
                {node.kind}
              </Badge>
              {renamingNodeId === node.id ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!nodeName.trim()) return;
                    renameMutation.mutate({ nodeId: node.id, name: nodeName.trim() });
                  }}
                  className="flex items-center gap-2"
                >
                  <Input
                    value={nodeName}
                    onChange={(e) => setNodeName(e.target.value)}
                    className="max-w-xs"
                    autoFocus
                  />
                  <Button type="submit" size="sm" disabled={renameMutation.isPending}>
                    <CheckCircle2 className="h-3.5 w-3.5" />
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
