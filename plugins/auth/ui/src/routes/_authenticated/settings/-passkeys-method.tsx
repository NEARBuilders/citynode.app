import { DotsThreeIcon, FingerprintIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Passkey, useAuthClient } from "everything-dev/ui/auth";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LocalDate } from "@/components/local-date";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { authErrorMessage } from "@/i18n/error-message";
import { useLoginTranslation } from "@/i18n/runtime";
import { passkeyQueryKey } from "@/lib/query-keys";
import { MethodHeader } from "./-method-header";

export function PasskeysMethod() {
  const translate = useLoginTranslation();
  const auth = useAuthClient();
  const queryClient = useQueryClient();
  const { data: passkeys = [], isPending } = useQuery({
    queryKey: passkeyQueryKey,
    queryFn: async () => {
      const { data } = await auth.passkey.listUserPasskeys();
      return (data || []) as Passkey[];
    },
    staleTime: 60 * 1000,
  });

  const [adding, setAdding] = useState(false);
  const [passkeyName, setPasskeyName] = useState("");
  const [passkeyToDelete, setPasskeyToDelete] = useState<Passkey | null>(null);

  const addPasskeyMutation = useMutation({
    mutationFn: async () => {
      const name = passkeyName.trim();
      const { error } = name
        ? await auth.passkey.addPasskey({ name })
        : await auth.passkey.addPasskey();
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setPasskeyName("");
      setAdding(false);
      toast.success(translate("auth.passkey.added"));
      void queryClient.invalidateQueries({ queryKey: passkeyQueryKey });
    },
    onError: (err: Error) => toast.error(authErrorMessage(err, translate)),
  });

  const removePasskeyMutation = useMutation({
    mutationFn: async (passkeyId: string) => {
      const { error } = await auth.passkey.deletePasskey({ id: passkeyId });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setPasskeyToDelete(null);
      toast.success(translate("auth.passkey.removed"));
      void queryClient.invalidateQueries({ queryKey: passkeyQueryKey });
    },
    onError: (err: Error) => toast.error(authErrorMessage(err, translate)),
  });

  const handleAdd = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    addPasskeyMutation.mutate();
  };

  return (
    <section className="flex flex-col gap-4" data-testid="settings.passkeys">
      <MethodHeader
        title={translate("auth.passkey.title")}
        description={translate("auth.passkey.description")}
        action={
          <Button
            variant="outline"
            onClick={() => setAdding(true)}
            data-testid="settings.add-passkey-button"
          >
            <PlusIcon data-icon="inline-start" />
            {translate("auth.passkey.add")}
          </Button>
        }
      />
      {isPending ? (
        <Skeleton className="h-16 w-full rounded-2xl" data-testid="settings.passkeys-loading" />
      ) : passkeys.length > 0 ? (
        <ItemGroup>
          {passkeys.map((passkey) => (
            <Item key={passkey.id} variant="outline" size="sm" role="listitem">
              <ItemMedia variant="icon">
                <FingerprintIcon />
              </ItemMedia>
              <ItemContent className="basis-0">
                <ItemTitle className="max-w-full">
                  <span className="min-w-0 truncate">
                    {passkey.name || translate("auth.passkey.key")}
                  </span>
                </ItemTitle>
                {passkey.createdAt && (
                  <ItemDescription>
                    {translate("auth.common.added")}
                    <LocalDate value={passkey.createdAt} />
                  </ItemDescription>
                )}
              </ItemContent>
              <ItemActions>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={removePasskeyMutation.isPending}
                        aria-label={translate("auth.common.actionsNamed", {
                          name: passkey.name || translate("auth.passkey.fallback"),
                        })}
                        data-testid={`settings.passkey-menu-${passkey.id}`}
                      />
                    }
                  >
                    <DotsThreeIcon />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => setPasskeyToDelete(passkey)}
                    >
                      <TrashIcon />
                      {translate("auth.passkey.remove")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      ) : (
        <p className="text-sm text-muted-foreground" data-testid="settings.passkeys-empty">
          {translate("auth.passkey.empty")}
        </p>
      )}

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent>
          <form onSubmit={handleAdd} className="flex flex-col gap-6">
            <DialogHeader>
              <DialogTitle>{translate("auth.passkey.addTitle")}</DialogTitle>
              <DialogDescription>{translate("auth.passkey.confirm")}</DialogDescription>
            </DialogHeader>
            <Field>
              <FieldLabel htmlFor="settings-passkey-name">
                {translate("auth.common.name")}
              </FieldLabel>
              <Input
                id="settings-passkey-name"
                type="text"
                value={passkeyName}
                onChange={(e) => setPasskeyName(e.target.value)}
                placeholder={translate("auth.passkey.example")}
                maxLength={64}
              />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAdding(false)}>
                {translate("auth.common.cancel")}
              </Button>
              <Button type="submit" disabled={addPasskeyMutation.isPending}>
                {addPasskeyMutation.isPending
                  ? translate("auth.onboard.passkeyPending")
                  : translate("auth.passkey.create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!passkeyToDelete}
        onOpenChange={(open: boolean) => {
          if (!open) setPasskeyToDelete(null);
        }}
        title={translate("auth.passkey.removeTitle")}
        description={translate("auth.settings.unlinkDescription", {
          name: passkeyToDelete?.name || translate("auth.passkey.thisKey"),
        })}
        confirmLabel="Remove"
        cancelLabel={translate("auth.common.cancel")}
        variant="destructive"
        onConfirm={() => {
          if (passkeyToDelete) removePasskeyMutation.mutate(passkeyToDelete.id);
        }}
        isPending={removePasskeyMutation.isPending}
      />
    </section>
  );
}
