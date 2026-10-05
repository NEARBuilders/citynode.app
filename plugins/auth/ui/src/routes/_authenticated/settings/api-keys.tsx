import {
  CopyIcon,
  DotsThreeIcon,
  KeyIcon,
  PlusIcon,
  TrashIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { sessionQueryOptions, useAuthClient } from "everything-dev/ui/auth";
import { matchLocale, Trans } from "everything-dev/ui/i18n";
import { getAppName } from "everything-dev/ui/runtime";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { SectionHeader } from "@/components/layout/section-header";
import { LocalDate } from "@/components/local-date";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { LOGIN_LOCALES } from "@/i18n/catalogs";
import { authErrorMessage } from "@/i18n/error-message";
import { translateLoginMessage, useLoginTranslation } from "@/i18n/runtime";
import { ApiKeyCreateDialog, type ApiKeyFormValues } from "./-api-key-create-dialog";
import { ApiKeyRevealDialog, type CreatedApiKey } from "./-api-key-reveal-dialog";

export const Route = createFileRoute("/_authenticated/settings/api-keys")({
  head: ({ match }) => ({
    meta: [
      {
        title: `${translateLoginMessage("auth.meta.apiKeys", undefined, matchLocale(match.context.locale, LOGIN_LOCALES) ?? "en")} · ${getAppName(match.context.runtimeConfig)}`,
      },
      {
        name: "description",
        content: translateLoginMessage(
          "auth.meta.apiKeysDescription",
          undefined,
          matchLocale(match.context.locale, LOGIN_LOCALES) ?? "en",
        ),
      },
    ],
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(sessionQueryOptions(context.authClient));
  },
  component: ApiKeysSettings,
});

type ApiKeyItem = {
  id: string;
  name: string | null;
  prefix: string | null;
  start: string | null;
  createdAt: string | Date;
  expiresAt?: string | Date | null;
};

async function copyText(value: string, message: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(message);
  } catch {
    toast.error(translateLoginMessage("auth.common.copyFailed"));
  }
}

const userApiKeysQueryKey = ["user-api-keys"] as const;

function ApiKeysSettings() {
  const translate = useLoginTranslation();
  const auth = useAuthClient();
  const queryClient = useQueryClient();
  const { data: session } = useQuery(sessionQueryOptions(auth));
  const user = session?.user;
  const [creating, setCreating] = useState(false);
  const [createdApiKey, setCreatedApiKey] = useState<CreatedApiKey | null>(null);
  const [keyToDelete, setKeyToDelete] = useState<ApiKeyItem | null>(null);

  const apiKeysQuery = useQuery({
    queryKey: userApiKeysQueryKey,
    queryFn: async (): Promise<ApiKeyItem[]> => {
      const { data, error } = await auth.apiKey.list({});
      if (error) throw new Error(error.message);
      return (data?.apiKeys ?? []) as ApiKeyItem[];
    },
    enabled: !!user,
  });
  const apiKeys = apiKeysQuery.data ?? [];

  const createApiKeyMutation = useMutation({
    mutationFn: async (values: ApiKeyFormValues) => {
      const { data, error } = await auth.apiKey.create({
        configId: "user-keys",
        name: values.name,
        ...(values.expiresIn !== undefined ? { expiresIn: values.expiresIn } : {}),
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: async (data) => {
      setCreating(false);
      if (data) setCreatedApiKey(data as CreatedApiKey);
      toast.success(translate("auth.keys.created"));
      await queryClient.invalidateQueries({ queryKey: userApiKeysQueryKey });
    },
    onError: (error: Error) => {
      toast.error(authErrorMessage(error, translate));
    },
  });

  const deleteApiKeyMutation = useMutation({
    mutationFn: async (keyId: string) => {
      const { error } = await auth.apiKey.delete({ keyId });
      if (error) throw new Error(error.message);
    },
    onMutate: async (keyId) => {
      await queryClient.cancelQueries({ queryKey: userApiKeysQueryKey });
      const previousKeys = queryClient.getQueryData<ApiKeyItem[]>(userApiKeysQueryKey);
      queryClient.setQueryData<ApiKeyItem[]>(userApiKeysQueryKey, (current) =>
        current?.filter((key) => key.id !== keyId),
      );
      return { previousKeys };
    },
    onSuccess: async () => {
      setKeyToDelete(null);
      toast.success(translate("auth.keys.deleted"));
      await queryClient.invalidateQueries({ queryKey: userApiKeysQueryKey });
    },
    onError: (error: Error, _keyId, context) => {
      if (context?.previousKeys) {
        queryClient.setQueryData(userApiKeysQueryKey, context.previousKeys);
      }
      toast.error(authErrorMessage(error, translate));
    },
  });

  if (!user) return null;

  const hasKeys = apiKeys.length > 0;

  return (
    <section className="flex flex-col gap-6">
      <SectionHeader
        title={translate("auth.settings.apiKeys")}
        description={
          <Trans
            id="auth.keys.headerHint"
            components={{ header: <code className="font-mono text-foreground" /> }}
          />
        }
        sectionTestId="api-keys.heading"
        action={
          hasKeys ? (
            <Button onClick={() => setCreating(true)} data-testid="api-keys.create-button">
              <PlusIcon data-icon="inline-start" />
              {translate("auth.keys.create")}
            </Button>
          ) : null
        }
      />

      {hasKeys ? (
        <ItemGroup data-testid="api-keys.list">
          {apiKeys.map((key) => (
            <Item key={key.id} variant="outline" size="sm" role="listitem">
              <ItemMedia variant="icon">
                <KeyIcon />
              </ItemMedia>
              <ItemContent className="basis-0">
                <ItemTitle className="max-w-full">
                  <span className="min-w-0 truncate">
                    {key.name ?? translate("auth.keys.unnamed")}
                  </span>
                </ItemTitle>
                <ItemDescription>
                  <span className="font-mono">
                    {key.prefix ?? "api_"}…{key.start ?? ""}
                  </span>
                  {" · "}
                  <Trans
                    id="auth.keys.createdDate"
                    values={{ date: <LocalDate value={key.createdAt} format="relative" /> }}
                  />
                  {key.expiresAt ? (
                    <>
                      {" · "}
                      <Trans
                        id="auth.keys.expiresDate"
                        values={{ date: <LocalDate value={key.expiresAt} /> }}
                      />
                    </>
                  ) : null}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={translate("auth.keys.actions", {
                          name: key.name ?? translate("auth.keys.key"),
                        })}
                        data-testid={`api-keys.menu-${key.id}`}
                      />
                    }
                  >
                    <DotsThreeIcon />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() =>
                        void copyText(key.start ?? "", translate("auth.keys.prefixCopied"))
                      }
                    >
                      <CopyIcon />
                      {translate("auth.keys.copyPrefix")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={() => setKeyToDelete(key)}>
                      <TrashIcon />
                      {translate("auth.keys.delete")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      ) : apiKeysQuery.isPending ? (
        <div className="flex flex-col gap-4" data-testid="api-keys.loading">
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
        </div>
      ) : apiKeysQuery.isError ? (
        <EmptyState
          icon={WarningCircleIcon}
          title={translate("auth.keys.loadFailed")}
          description={translate("auth.common.connectionHint")}
          action={
            <Button
              variant="outline"
              onClick={() => void apiKeysQuery.refetch()}
              data-testid="api-keys.retry-button"
            >
              {translate("auth.common.retry")}
            </Button>
          }
        />
      ) : (
        <EmptyState
          icon={KeyIcon}
          title={translate("auth.keys.empty")}
          description={translate("auth.keys.emptyDescription")}
          action={
            <Button onClick={() => setCreating(true)} data-testid="api-keys.create-button">
              <PlusIcon data-icon="inline-start" />
              {translate("auth.keys.create")}
            </Button>
          }
        />
      )}

      <ApiKeyCreateDialog
        open={creating}
        onOpenChange={setCreating}
        onCreate={(values) => createApiKeyMutation.mutate(values)}
        isPending={createApiKeyMutation.isPending}
      />
      <ApiKeyRevealDialog apiKey={createdApiKey} onDismiss={() => setCreatedApiKey(null)} />
      <ConfirmDialog
        open={!!keyToDelete}
        onOpenChange={(open: boolean) => {
          if (!open) setKeyToDelete(null);
        }}
        title={translate("auth.keys.deleteTitle")}
        description={translate("auth.keys.deleteDescription", {
          name: keyToDelete?.name ?? translate("auth.keys.thisKey"),
        })}
        confirmLabel={translate("auth.keys.delete")}
        cancelLabel={translate("auth.common.cancel")}
        variant="destructive"
        onConfirm={() => {
          if (keyToDelete) deleteApiKeyMutation.mutate(keyToDelete.id);
        }}
        isPending={deleteApiKeyMutation.isPending}
      />
    </section>
  );
}
