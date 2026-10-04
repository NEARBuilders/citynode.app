import {
  PencilSimpleIcon,
  PlusIcon,
  ShieldCheckIcon,
  StarIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useApiClient } from "@/app";
import {
  Badge,
  Button,
  ConfirmDialog,
  Field,
  FieldLabel,
  Input,
  SectionHeader,
} from "@/components";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AppTranslator } from "@/i18n/catalogs";
import { appErrorMessage } from "@/i18n/error-message";
import { useAppTranslation } from "@/i18n/runtime";
import { fetchPoolOwner } from "@/lib/pool-owner";
import { presentationLabel } from "@/lib/presentation-label";
import {
  invalidateNodeQueries,
  nodeValidatorsQueryOptions,
  tenantNodesQueryOptions,
} from "@/lib/queries/nodes";
import { roleLabel } from "../orgs/-org-avatar";
import { RowMenu } from "../orgs/-row-menu";

interface TenantNodeValidatorsProps {
  tenantId: string;
  canManage: boolean;
}

export function createValidatorRoleItems(t: AppTranslator) {
  return [
    { label: t("tenant.official"), value: "official" },
    { label: t("tenant.communityType"), value: "community" },
  ];
}

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
  const translate = useAppTranslation();
  const VALIDATOR_ROLE_ITEMS = createValidatorRoleItems(translate);
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
  const translate = useAppTranslation();
  const { data: owner, isLoading } = useQuery({
    queryKey: ["pool-owner", network, poolAccountId],
    queryFn: () => fetchPoolOwner(poolAccountId, network),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <span className="text-sm text-muted-foreground" title={translate("tenant.readingOwner")}>
        {translate("tenant.checkingOwner")}
      </span>
    );
  }

  if (!owner) {
    return (
      <span
        className="text-sm text-muted-foreground"
        title={translate("tenant.notPoolDescription")}
      >
        {translate("tenant.notPool")}
      </span>
    );
  }

  return (
    <span
      className="inline-flex min-w-0 flex-wrap items-center gap-1 text-sm text-muted-foreground"
      title={translate("tenant.ownerVerified")}
    >
      <ShieldCheckIcon className="size-3.5 shrink-0 text-success" />
      {translate("tenant.ownedByNamed", { owner })}
    </span>
  );
}

function NodeSection({ nodeId, canManage }: { nodeId: string; canManage: boolean }) {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const [newAccountId, setNewAccountId] = useState("");
  const [newRole, setNewRole] = useState<"official" | "community">("community");
  const [removing, setRemoving] = useState<ValidatorRow | null>(null);

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
      toast.success(translate("tenant.validatorAdded"));
      setNewAccountId("");
      void invalidate();
    },
    onError: (error: Error) => toast.error(appErrorMessage(error, translate)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (validatorId: string) => apiClient.deleteValidator({ validatorId }),
    onSuccess: () => {
      toast.success(translate("tenant.validatorRemoved"));
      void invalidate();
    },
    onError: (error: Error) => toast.error(appErrorMessage(error, translate)),
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (validatorId: string) => apiClient.setDefaultValidator({ validatorId }),
    onSuccess: () => {
      toast.success(translate("tenant.defaultUpdated"));
      void invalidate();
    },
    onError: (error: Error) => toast.error(appErrorMessage(error, translate)),
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
      toast.success(translate("tenant.validatorUpdated"));
      void invalidate();
    },
    onError: (error: Error) => toast.error(appErrorMessage(error, translate)),
  });

  return (
    <div className="flex flex-col gap-3">
      {validators.length === 0 ? (
        <p className="text-sm text-muted-foreground">{translate("tenant.noValidators")}</p>
      ) : (
        <ItemGroup>
          {validators.map((validator, index) => (
            <div key={validator.id} className="flex flex-col">
              {index > 0 && <ItemSeparator />}
              <Item size="sm" data-testid={`tenant-validator-${validator.id}`}>
                <ItemContent className="min-w-0">
                  <ItemTitle className="break-all">
                    <span className="font-mono">{validator.accountId}</span>
                    {validator.isDefault && (
                      <Badge variant="secondary">{translate("common.default")}</Badge>
                    )}
                  </ItemTitle>
                  <ItemDescription>
                    <PoolOwnerBadge
                      poolAccountId={validator.accountId}
                      network={validator.network}
                    />
                  </ItemDescription>
                </ItemContent>
                <ItemActions className="flex-wrap">
                  {canManage ? (
                    <>
                      <ValidatorRoleSelect
                        value={validator.role}
                        ariaLabel={translate("tenant.validatorRoleNamed", {
                          account: validator.accountId ?? "",
                        })}
                        onChange={(role) =>
                          updateRoleMutation.mutate({ validatorId: validator.id, role })
                        }
                      />
                      <RowMenu
                        label={translate("common.actionsNamed", {
                          name: validator.accountId ?? "",
                        })}
                      >
                        {!validator.isDefault && (
                          <DropdownMenuItem
                            onClick={() => setDefaultMutation.mutate(validator.id)}
                            disabled={setDefaultMutation.isPending}
                          >
                            <StarIcon />
                            {translate("tenant.makeDefault")}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setRemoving(validator)}
                          disabled={deleteMutation.isPending}
                        >
                          <TrashIcon />
                          {translate("tenant.removeValidator")}
                        </DropdownMenuItem>
                      </RowMenu>
                    </>
                  ) : (
                    <Badge variant="outline">{roleLabel(validator.role, translate)}</Badge>
                  )}
                </ItemActions>
              </Item>
            </div>
          ))}
        </ItemGroup>
      )}

      {canManage && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!newAccountId.trim()) return;
            createMutation.mutate();
          }}
          className="flex max-w-2xl flex-col gap-2 sm:flex-row"
        >
          <Field className="min-w-0 flex-1">
            <FieldLabel htmlFor={`new-validator-account-${nodeId}`} className="sr-only">
              {translate("tenant.validatorAccount")}
            </FieldLabel>
            <Input
              id={`new-validator-account-${nodeId}`}
              value={newAccountId}
              onChange={(e) => setNewAccountId(e.target.value)}
              placeholder="everything.pool.near"
              className="font-mono"
              required
            />
          </Field>
          <div className="flex gap-2">
            <ValidatorRoleSelect
              value={newRole}
              ariaLabel={translate("tenant.newValidatorRole")}
              onChange={setNewRole}
            />
            <Button
              type="submit"
              variant="outline"
              className="flex-1 sm:flex-none"
              disabled={createMutation.isPending || !newAccountId.trim()}
            >
              <PlusIcon />
              {translate("tenant.addValidator")}
            </Button>
          </div>
        </form>
      )}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={translate("common.removeQuestion", {
          name: removing?.accountId ?? translate("tenant.validatorFallback"),
        })}
        description={translate("tenant.removeValidatorDescription")}
        confirmLabel={translate("common.remove")}
        variant="destructive"
        isPending={deleteMutation.isPending}
        onConfirm={() => {
          if (removing) deleteMutation.mutate(removing.id);
          setRemoving(null);
        }}
      />
    </div>
  );
}

export function TenantNodeValidators({ tenantId, canManage }: TenantNodeValidatorsProps) {
  const translate = useAppTranslation();
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
      toast.success(translate("tenant.nodeRenamed"));
      setRenamingNodeId(null);
      void invalidateNodeQueries(queryClient);
    },
    onError: (error: Error) => toast.error(appErrorMessage(error, translate)),
  });

  return (
    <section className="flex flex-col gap-6" data-testid="tenant.section.validators">
      <SectionHeader title={translate("tenant.nodeValidators")} />
      {nodes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{translate("tenant.noNode")}</p>
      ) : (
        nodes.map((node) => (
          <div key={node.id} className="flex flex-col gap-3">
            {renamingNodeId === node.id ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!nodeName.trim()) return;
                  renameMutation.mutate({ nodeId: node.id, name: nodeName.trim() });
                }}
                className="flex max-w-md flex-wrap gap-2"
              >
                <Input
                  id={`node-name-${node.id}`}
                  aria-label={translate("tenant.nodeName")}
                  value={nodeName}
                  onChange={(e) => setNodeName(e.target.value)}
                  autoFocus
                  className="min-w-0 flex-1"
                />
                <Button type="submit" disabled={renameMutation.isPending}>
                  {translate("common.save")}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setRenamingNodeId(null)}>
                  {translate("common.cancel")}
                </Button>
              </form>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-medium text-foreground">{node.name}</h3>
                <Badge variant="outline">
                  {presentationLabel(node.kind ?? "member", translate)}
                </Badge>
                <span className="font-mono text-sm break-all text-muted-foreground">
                  {node.slug}
                </span>
                {canManage && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={translate("common.renameNamed", { name: node.name ?? "" })}
                    onClick={() => {
                      setNodeName(node.name);
                      setRenamingNodeId(node.id);
                    }}
                  >
                    <PencilSimpleIcon />
                  </Button>
                )}
              </div>
            )}
            <NodeSection nodeId={node.id} canManage={canManage} />
          </div>
        ))
      )}
    </section>
  );
}
