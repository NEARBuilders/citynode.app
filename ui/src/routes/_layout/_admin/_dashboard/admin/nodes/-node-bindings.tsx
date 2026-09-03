import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { type ApiClient, useApiClient } from "@/app";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  SectionHeader,
  Skeleton,
  UnderConstruction,
} from "@/components";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { invalidateTenantQueries, tenantBindingsQueryOptions } from "@/lib/queries/tenants";

type Binding = Awaited<ReturnType<ApiClient["listTenantBindingsForTenant"]>>[number];

export function NodeBindings({ tenantId, gateway }: { tenantId: string; gateway: string }) {
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
      toast.success(action === "remove" ? "Domain binding removed" : "Domain ownership verified");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section className="space-y-3">
      <SectionHeader
        title="Domain bindings"
        action={
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus /> add domain
          </Button>
        }
      />
      <p className="text-sm text-muted-foreground">
        These bindings are shared by every node belonging to this tenant. Routing changes can take
        up to 30 seconds.
      </p>
      {bindingsQuery.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : bindingsQuery.isError ? (
        <Card className="space-y-3 p-6">
          <p role="alert" className="text-sm text-destructive">
            {bindingsQuery.error.message}
          </p>
          <Button variant="outline" onClick={() => bindingsQuery.refetch()}>
            retry
          </Button>
        </Card>
      ) : !bindingsQuery.data?.length ? (
        <Card className="p-6 text-sm text-muted-foreground">No domain bindings.</Card>
      ) : (
        bindingsQuery.data.map((binding) => {
          const isAlias = !binding.hostname.includes(".");
          const hostname = isAlias ? `${binding.hostname}.${gateway}` : binding.hostname;
          return (
            <Card
              key={binding.id}
              role="group"
              aria-label={hostname}
              className="space-y-4 p-4 sm:p-6"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-2">
                  <p className="break-all font-mono text-sm text-foreground">{hostname}</p>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{isAlias ? "platform alias" : "custom domain"}</Badge>
                    {binding.isPrimary && <Badge variant="secondary">primary</Badge>}
                    <Badge variant={isAlias || binding.isVerified ? "default" : "secondary"}>
                      {isAlias
                        ? "no verification needed"
                        : binding.isVerified
                          ? "verified"
                          : "pending verification"}
                    </Badge>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={mutation.isPending}
                  onClick={() => setRemoving(binding)}
                >
                  remove
                </Button>
              </div>
              {!isAlias && !binding.isVerified && (
                <div className="space-y-3 border-t border-border pt-4">
                  <p className="text-sm text-muted-foreground">
                    Add this TXT record at your DNS provider, then check verification.
                  </p>
                  <dl className="grid gap-2 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
                    <dt className="text-muted-foreground">Type</dt>
                    <dd className="font-mono">TXT</dd>
                    <dt className="text-muted-foreground">Name / host</dt>
                    <dd className="break-all font-mono">{binding.hostname}</dd>
                    <dt className="text-muted-foreground">Value</dt>
                    <dd className="break-all font-mono">
                      everything-verify={binding.verificationToken}
                    </dd>
                  </dl>
                  <p className="text-xs text-muted-foreground">
                    DNS records may take time to propagate. Configure DNS routing and HTTPS for this
                    domain separately.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate({ binding, action: "verify" })}
                  >
                    {mutation.isPending && mutation.variables?.binding.id === binding.id
                      ? "checking..."
                      : "check verification"}
                  </Button>
                  {mutation.isError &&
                    mutation.variables?.binding.id === binding.id &&
                    mutation.variables.action === "verify" && (
                      <p role="alert" className="text-sm text-destructive">
                        {mutation.error.message}
                      </p>
                    )}
                  <UnderConstruction
                    label="domain routing"
                    url="https://www.reddit.com/r/rust/comments/1qew4ra/near_dns_dns_records_stored_on_blockchain_and/"
                    tooltip="learn about near-dns and contribute"
                  />
                </div>
              )}
            </Card>
          );
        })
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
        title="Remove domain binding?"
        description={`Remove ${removing?.hostname ?? "this domain"}? It will no longer route to this tenant. Other nodes sharing the tenant are also affected.`}
        variant="destructive"
        confirmLabel="remove domain"
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
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState("alias");
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
        kind === "alias" ? "Platform alias added" : "Domain added — DNS verification required",
      );
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <DialogContent className="max-h-[90dvh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Add domain binding</DialogTitle>
        <DialogDescription>Choose a platform alias or bring your own domain.</DialogDescription>
      </DialogHeader>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="binding-kind">Domain type</Label>
          <Select
            value={kind}
            onValueChange={(value) => {
              setKind(value);
              setHostname("");
              mutation.reset();
            }}
          >
            <SelectTrigger id="binding-kind" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alias">Platform alias</SelectItem>
              <SelectItem value="custom">Custom domain</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="binding-hostname">{kind === "alias" ? "Alias" : "Domain"}</Label>
          <Input
            id="binding-hostname"
            value={hostname}
            onChange={(event) => setHostname(event.target.value)}
            placeholder={kind === "alias" ? "chicago" : "nyc.gov"}
            autoCapitalize="none"
            spellCheck={false}
            required
          />
        </div>
        <p className="break-all text-sm text-muted-foreground">
          {kind === "alias"
            ? `${normalized || "alias"}.${gateway} — no verification needed.`
            : `${normalized || "Your domain"} — DNS TXT verification required.`}
        </p>
        {mutation.isError && (
          <p role="alert" className="text-sm text-destructive">
            {mutation.error.message}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
            cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending || !normalized}>
            {mutation.isPending ? "adding..." : "add domain"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
