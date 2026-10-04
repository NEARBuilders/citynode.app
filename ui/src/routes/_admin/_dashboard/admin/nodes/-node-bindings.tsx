import { GlobeIcon, PlusIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  FieldDescription,
  FieldLabel,
  Input,
  SectionHeader,
  UnderConstruction,
} from "@/components";
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
import { invalidateTenantQueries, tenantBindingsQueryOptions } from "@/lib/queries/tenants";
import { ListSkeleton, RowMenu } from "../-admin-ui";

type Binding = Awaited<ReturnType<ApiClient["listTenantBindingsForTenant"]>>[number];

export function createBindingKindItems(t: AppTranslator) {
  return [
    { label: t("admin.domain.platformAlias"), value: "alias" },
    { label: t("admin.domain.custom"), value: "custom" },
  ];
}

export function NodeBindings({ tenantId, gateway }: { tenantId: string; gateway: string }) {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Binding | null>(null);
  const bindingsQuery = useQuery(tenantBindingsQueryOptions(apiClient, tenantId));
  const mutation = useMutation({
    mutationFn: async ({ binding, action }: { binding: Binding; action: "remove" | "verify" }) => {
      if (action === "remove") await apiClient.deleteBinding({ tenantId, bindingId: binding.id });
      else await apiClient.verifyCustomDomain({ tenantId, bindingId: binding.id });
    },
    onSuccess: async (_, { action }) => {
      await invalidateTenantQueries(queryClient);
      setRemoving(null);
      toast.success(
        action === "remove" ? translate("admin.domainRemoved") : translate("admin.domainVerified"),
      );
    },
    onError: (error: Error) => toast.error(appErrorMessage(error, translate)),
  });

  return (
    <section className="flex flex-col gap-6">
      <SectionHeader
        title={translate("admin.domain.title")}
        description={translate("admin.domain.sharedHint")}
        action={
          <Button size="sm" onClick={() => setAdding(true)} data-testid="admin-node-add-domain">
            <PlusIcon />
            {translate("admin.domain.add")}
          </Button>
        }
      />
      {bindingsQuery.isLoading ? (
        <ListSkeleton rows={2} />
      ) : bindingsQuery.isError ? (
        <div className="flex flex-wrap items-center gap-3">
          <p role="alert" className="text-sm text-destructive">
            {appErrorMessage(bindingsQuery.error, translate)}
          </p>
          <Button variant="outline" size="sm" onClick={() => bindingsQuery.refetch()}>
            {translate("org.retry")}
          </Button>
        </div>
      ) : !bindingsQuery.data?.length ? (
        <EmptyState
          icon={GlobeIcon}
          title={translate("admin.domain.empty")}
          description={translate("admin.domain.emptyHint")}
          className="py-10"
        />
      ) : (
        <ItemGroup data-testid="admin-node-domains">
          {bindingsQuery.data.map((binding) => {
            const isAlias = !binding.hostname.includes(".");
            const hostname = isAlias ? `${binding.hostname}.${gateway}` : binding.hostname;
            const needsVerification = !isAlias && !binding.isVerified;
            const verifying =
              mutation.isPending &&
              mutation.variables?.binding.id === binding.id &&
              mutation.variables.action === "verify";
            return (
              <Item key={binding.id} variant="outline" role="group" aria-label={hostname}>
                <ItemMedia variant="icon">
                  <GlobeIcon />
                </ItemMedia>
                <ItemContent className="min-w-0">
                  <ItemTitle className="max-w-full">
                    <span className="min-w-0 truncate font-mono">{hostname}</span>
                  </ItemTitle>
                  <ItemDescription>
                    {isAlias
                      ? translate("admin.domain.platformAlias")
                      : translate("admin.domain.custom")}
                  </ItemDescription>
                  {(binding.isPrimary || !isAlias) && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {binding.isPrimary && (
                        <Badge variant="secondary">{translate("common.primary")}</Badge>
                      )}
                      {!isAlias && (
                        <Badge variant={binding.isVerified ? "success" : "warning"}>
                          {binding.isVerified
                            ? translate("common.verified")
                            : translate("common.unverified")}
                        </Badge>
                      )}
                    </div>
                  )}
                </ItemContent>
                <ItemActions>
                  <RowMenu
                    label={translate("common.actionsNamed", { name: hostname ?? "" })}
                    actions={[
                      {
                        label: translate("common.remove"),
                        destructive: true,
                        disabled: mutation.isPending,
                        onSelect: () => setRemoving(binding),
                      },
                    ]}
                  />
                </ItemActions>
                {needsVerification && (
                  <div className="flex basis-full flex-col gap-4 border-t border-border pt-4">
                    <p className="text-sm text-muted-foreground">
                      {translate("admin.domain.txtHint")}
                    </p>
                    <dl className="grid grid-cols-4 gap-x-4 gap-y-2 text-sm text-foreground">
                      <dt className="text-muted-foreground">{translate("common.type")}</dt>
                      <dd className="col-span-3 font-mono">TXT</dd>
                      <dt className="text-muted-foreground">{translate("admin.system.host")}</dt>
                      <dd className="col-span-3 font-mono break-all">{binding.hostname}</dd>
                      <dt className="text-muted-foreground">{translate("common.value")}</dt>
                      <dd className="col-span-3 font-mono break-all">
                        everything-verify={binding.verificationToken}
                      </dd>
                    </dl>
                    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                      <Button
                        variant="outline"
                        className="w-full sm:w-auto"
                        disabled={mutation.isPending}
                        onClick={() => mutation.mutate({ binding, action: "verify" })}
                      >
                        {verifying ? translate("common.checking") : translate("admin.domain.check")}
                      </Button>
                      <UnderConstruction
                        label={translate("admin.domain.routing")}
                        url="https://www.reddit.com/r/rust/comments/1qew4ra/near_dns_dns_records_stored_on_blockchain_and/"
                        tooltip={translate("admin.domain.contribute")}
                      />
                    </div>
                    {mutation.isError &&
                      mutation.variables?.binding.id === binding.id &&
                      mutation.variables.action === "verify" && (
                        <p role="alert" className="text-sm text-destructive">
                          {appErrorMessage(mutation.error, translate)}
                        </p>
                      )}
                  </div>
                )}
              </Item>
            );
          })}
        </ItemGroup>
      )}
      <Dialog open={adding} onOpenChange={setAdding}>
        {adding && (
          <AddBindingForm tenantId={tenantId} gateway={gateway} onClose={() => setAdding(false)} />
        )}
      </Dialog>
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title={translate("admin.domain.removeTitle")}
        description={translate("admin.domainRemoveNamed", {
          hostname: removing?.hostname ?? translate("admin.domain.fallback"),
        })}
        variant="destructive"
        confirmLabel={translate("admin.removeDomain")}
        cancelLabel={translate("common.cancel")}
        isPending={mutation.isPending}
        onConfirm={() => {
          if (removing) mutation.mutate({ binding: removing, action: "remove" });
        }}
      />
    </section>
  );
}

function AddBindingForm({
  tenantId,
  gateway,
  onClose,
}: {
  tenantId: string;
  gateway: string;
  onClose: () => void;
}) {
  const translate = useAppTranslation();
  const BINDING_KIND_ITEMS = createBindingKindItems(translate);

  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<string>("alias");
  const [hostname, setHostname] = useState("");
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, "");
  const mutation = useMutation({
    mutationFn: () => {
      if (kind === "alias" && !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(normalized)) {
        throw new Error("Enter a single alias using letters, numbers, and hyphens.");
      }
      if (kind === "custom" && !normalized.includes(".")) {
        throw new Error("Enter a full domain such as nyc.gov.");
      }
      return apiClient.createBinding({ tenantId, hostname: normalized });
    },
    onSuccess: async () => {
      await invalidateTenantQueries(queryClient);
      toast.success(
        kind === "alias" ? translate("admin.aliasAdded") : translate("admin.domainAddedDns"),
      );
      onClose();
    },
    onError: (error: Error) => toast.error(appErrorMessage(error, translate)),
  });
  return (
    <DialogContent className="max-h-11/12 overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{translate("admin.domain.add")}</DialogTitle>
        <DialogDescription>{translate("admin.domain.chooseHint")}</DialogDescription>
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
            <FieldLabel htmlFor="binding-kind">{translate("admin.domain.type")}</FieldLabel>
            <Select
              value={kind}
              items={BINDING_KIND_ITEMS}
              onValueChange={(value) => {
                if (value === null) return;
                setKind(value);
                setHostname("");
                mutation.reset();
              }}
            >
              <SelectTrigger id="binding-kind" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alias">{translate("admin.domain.platformAlias")}</SelectItem>
                <SelectItem value="custom">{translate("admin.domain.custom")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="binding-hostname">
              {kind === "alias"
                ? translate("admin.domain.alias")
                : translate("admin.domain.domain")}
            </FieldLabel>
            <Input
              id="binding-hostname"
              value={hostname}
              onChange={(event) => setHostname(event.target.value)}
              placeholder={kind === "alias" ? "chicago" : "nyc.gov"}
              autoCapitalize="none"
              spellCheck={false}
              required
            />
            <FieldDescription className="break-all">
              {kind === "alias"
                ? translate("admin.domain.aliasHintNamed", {
                    hostname: `${normalized || translate("admin.domain.aliasExample")}.${gateway}`,
                  })
                : translate("admin.domain.customHintNamed", {
                    hostname: normalized || translate("admin.domain.yourDomain"),
                  })}
            </FieldDescription>
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
          <Button type="submit" disabled={mutation.isPending || !normalized}>
            {mutation.isPending ? translate("common.adding") : translate("admin.domain.add")}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
