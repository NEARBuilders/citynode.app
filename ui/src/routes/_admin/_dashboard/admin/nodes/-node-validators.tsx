import { PlusIcon, ShieldCheckIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { type ApiClient, useApiClient } from "@/app";
import {
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Field,
  FieldLabel,
  Input,
  SectionHeader,
} from "@/components";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldGroup } from "@/components/ui/field";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
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
import { invalidateNodeQueries } from "@/lib/queries/nodes";
import { humanize, RowMenu } from "../-admin-ui";

type Validator = Awaited<ReturnType<ApiClient["getNodeSummary"]>>["validators"][number];

export function createValidatorRoleItems(t: AppTranslator) {
  return [
    { label: t("tenant.communityType"), value: "community" },
    { label: t("tenant.official"), value: "official" },
  ];
}

export function NodeValidators({
  nodeId,
  validators,
}: {
  nodeId: string;
  validators: Validator[];
}) {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Validator | null>(null);
  const mutation = useMutation({
    mutationFn: async ({
      validator,
      action,
    }: {
      validator: Validator;
      action: "remove" | "default";
    }) => {
      if (action === "remove") await apiClient.deleteValidator({ validatorId: validator.id });
      else await apiClient.setDefaultValidator({ validatorId: validator.id });
    },
    onSuccess: async (_, { action }) => {
      await invalidateNodeQueries(queryClient);
      setRemoving(null);
      toast.success(
        action === "remove"
          ? translate("admin.validatorRemoved")
          : translate("admin.defaultValidatorUpdated"),
      );
    },
    onError: (error: Error) => toast.error(appErrorMessage(error, translate)),
  });

  return (
    <section className="flex flex-col gap-6">
      <SectionHeader
        title={translate("common.validators")}
        description={translate("admin.validator.description")}
        action={
          <Button size="sm" onClick={() => setAdding(true)} data-testid="admin-node-add-validator">
            <PlusIcon />
            {translate("tenant.addValidator")}
          </Button>
        }
      />
      {validators.length === 0 ? (
        <EmptyState
          icon={ShieldCheckIcon}
          title={translate("admin.validator.empty")}
          description={translate("admin.validator.emptyHint")}
          className="py-10"
        />
      ) : (
        <ItemGroup data-testid="admin-node-validators">
          {validators.map((validator) => (
            <Item key={validator.id} variant="outline">
              <ItemMedia variant="icon">
                <ShieldCheckIcon />
              </ItemMedia>
              <ItemContent className="min-w-0">
                <ItemTitle className="max-w-full">
                  <span className="min-w-0 truncate font-mono">{validator.accountId}</span>
                </ItemTitle>
                <ItemDescription>
                  {humanize(validator.role, translate)} · {validator.network} · {validator.protocol}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                {validator.isDefault && (
                  <Badge variant="success">{translate("common.default")}</Badge>
                )}
                <RowMenu
                  label={translate("common.actionsNamed", { name: validator.accountId ?? "" })}
                  actions={[
                    ...(validator.isDefault
                      ? []
                      : [
                          {
                            label: translate("tenant.makeDefault"),
                            disabled: mutation.isPending,
                            onSelect: () => mutation.mutate({ validator, action: "default" }),
                          },
                        ]),
                    {
                      label: translate("common.remove"),
                      destructive: true,
                      disabled: mutation.isPending,
                      onSelect: () => setRemoving(validator),
                    },
                  ]}
                />
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      )}
      <Dialog open={adding} onOpenChange={setAdding}>
        {adding && <AddValidatorForm nodeId={nodeId} onClose={() => setAdding(false)} />}
      </Dialog>
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title={translate("admin.validator.removeTitle")}
        description={translate("admin.validatorRemoveNamed", {
          account: removing?.accountId ?? translate("admin.validator.fallback"),
        })}
        variant="destructive"
        confirmLabel={translate("admin.removeValidator")}
        cancelLabel={translate("common.cancel")}
        isPending={mutation.isPending}
        onConfirm={() => {
          if (removing) mutation.mutate({ validator: removing, action: "remove" });
        }}
      />
    </section>
  );
}

function AddValidatorForm({ nodeId, onClose }: { nodeId: string; onClose: () => void }) {
  const translate = useAppTranslation();
  const VALIDATOR_ROLE_ITEMS = createValidatorRoleItems(translate);

  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const [accountId, setAccountId] = useState("");
  const [network, setNetwork] = useState("mainnet");
  const [protocol, setProtocol] = useState("near");
  const [role, setRole] = useState<Validator["role"]>("community");
  const [isDefault, setIsDefault] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const mutation = useMutation({
    mutationFn: () =>
      apiClient.createValidator({
        nodeId,
        accountId: accountId.trim(),
        network: network.trim(),
        protocol: protocol.trim(),
        role,
        isDefault,
      }),
    onSuccess: async () => {
      await invalidateNodeQueries(queryClient);
      toast.success(translate("tenant.validatorAdded"));
      onClose();
    },
    onError: (error: Error) => toast.error(appErrorMessage(error, translate)),
  });
  return (
    <DialogContent className="max-h-11/12 overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{translate("tenant.addValidator")}</DialogTitle>
        <DialogDescription>{translate("admin.validator.addDescription")}</DialogDescription>
      </DialogHeader>
      <form
        className="flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="validator-account">
              {translate("admin.validator.poolAccount")}
            </FieldLabel>
            <Input
              id="validator-account"
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              placeholder="everything.pool.near"
              required
              className="font-mono"
            />
          </Field>
          {showAdvanced ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="validator-network">{translate("common.network")}</FieldLabel>
                <Input
                  id="validator-network"
                  value={network}
                  onChange={(event) => setNetwork(event.target.value)}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="validator-protocol">
                  {translate("admin.validator.protocol")}
                </FieldLabel>
                <Input
                  id="validator-protocol"
                  value={protocol}
                  onChange={(event) => setProtocol(event.target.value)}
                  required
                />
              </Field>
            </div>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => setShowAdvanced(true)}
            >
              {translate("admin.changeNetworkNamed", { network, protocol })}
            </Button>
          )}
          <Field>
            <FieldLabel htmlFor="validator-role">{translate("org.role")}</FieldLabel>
            <Select
              value={role}
              items={VALIDATOR_ROLE_ITEMS}
              onValueChange={(value) => setRole(value === "official" ? "official" : "community")}
            >
              <SelectTrigger id="validator-role" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="community">{translate("common.community")}</SelectItem>
                <SelectItem value="official">{translate("tenant.official")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field orientation="horizontal">
            <Checkbox
              id="validator-default"
              checked={isDefault}
              onCheckedChange={(checked) => setIsDefault(checked === true)}
            />
            <FieldLabel htmlFor="validator-default">
              {translate("admin.validator.makeDefault")}
            </FieldLabel>
          </Field>
        </FieldGroup>
        {mutation.isError && (
          <p role="alert" className="text-sm text-destructive">
            {appErrorMessage(mutation.error, translate)}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
            {translate("common.cancel")}
          </Button>
          <Button
            type="submit"
            disabled={
              mutation.isPending || !accountId.trim() || !network.trim() || !protocol.trim()
            }
          >
            {mutation.isPending ? translate("common.adding") : translate("tenant.addValidator")}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
