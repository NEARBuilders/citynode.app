import { DownloadSimpleIcon, LinkIcon, QrCodeIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import type { ApiClient } from "@/app";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  FieldLabel,
  Input,
  SectionHeader,
  Skeleton,
} from "@/components";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import { Switch } from "@/components/ui/switch";
import { appErrorMessage } from "@/i18n/error-message";
import { useAppTranslation } from "@/i18n/runtime";
import { onboardingLinkUrl } from "@/lib/gateway-origin";
import {
  downloadQr,
  type OnboardingLink,
  onboardingLinksQueryKey,
  onboardingLinksQueryOptions,
  useGatewayOrigin,
} from "@/lib/onboarding-links";

function LinkForm({
  initial,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
  idPrefix,
}: {
  initial?: { name: string; destination: string };
  submitLabel: string;
  pending: boolean;
  onSubmit: (values: { name: string; destination: string }) => void;
  onCancel?: () => void;
  idPrefix: string;
}) {
  const translate = useAppTranslation();
  const [name, setName] = useState(initial?.name ?? "");
  const [destination, setDestination] = useState(initial?.destination ?? "");
  return (
    <form
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ name: name.trim(), destination: destination.trim() });
      }}
      data-testid={`${idPrefix}.form`}
    >
      <Field className="min-w-0 sm:w-56">
        <FieldLabel htmlFor={`${idPrefix}-name`}>{translate("links.name")}</FieldLabel>
        <Input
          id={`${idPrefix}-name`}
          value={name}
          maxLength={80}
          required
          placeholder={translate("links.namePlaceholder")}
          onChange={(event) => setName(event.target.value)}
          data-testid={`${idPrefix}.name`}
        />
      </Field>
      <Field className="min-w-0 flex-1">
        <FieldLabel htmlFor={`${idPrefix}-destination`}>
          {translate("links.destination")}
        </FieldLabel>
        <Input
          id={`${idPrefix}-destination`}
          type="url"
          inputMode="url"
          value={destination}
          maxLength={2048}
          required
          placeholder="https://"
          onChange={(event) => setDestination(event.target.value)}
          data-testid={`${idPrefix}.destination`}
        />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending} data-testid={`${idPrefix}.submit`}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            {translate("links.cancel")}
          </Button>
        )}
      </div>
    </form>
  );
}

function LinkRow({
  apiClient,
  orgId,
  link,
  gatewayOrigin,
}: {
  apiClient: ApiClient;
  orgId: string;
  link: OnboardingLink;
  gatewayOrigin: string | null;
}) {
  const translate = useAppTranslation();
  const queryClient = useQueryClient();
  const location = useLocation();
  const [editing, setEditing] = useState(false);
  const shortUrl = gatewayOrigin ? onboardingLinkUrl(gatewayOrigin, link.slug) : null;

  const update = useMutation({
    mutationFn: (patch: { name?: string; destination?: string; enabled?: boolean }) =>
      apiClient.updateOnboardingLink({ linkId: link.id, organizationId: orgId, ...patch }),
    onSuccess: () => {
      setEditing(false);
      void queryClient.invalidateQueries({ queryKey: onboardingLinksQueryKey(orgId) });
    },
    onError: (error) => toast.error(appErrorMessage(error, translate)),
  });

  if (editing) {
    return (
      <div className="py-3">
        <LinkForm
          idPrefix={`links.edit-${link.id}`}
          initial={{ name: link.name, destination: link.destination }}
          submitLabel={translate("links.save")}
          pending={update.isPending}
          onSubmit={(values) => update.mutate(values)}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <Item size="sm" data-testid={`links.row-${link.id}`}>
      <ItemMedia variant="icon">
        <QrCodeIcon />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="max-w-full">
          <span className="min-w-0 truncate">{link.name}</span>
        </ItemTitle>
        <ItemDescription className="flex min-w-0 flex-col gap-0.5">
          {shortUrl && <span className="truncate font-mono text-xs">{shortUrl}</span>}
          <span className="truncate text-xs">
            {translate("links.goesTo", { destination: link.destination })}
          </span>
        </ItemDescription>
      </ItemContent>
      <ItemActions className="flex-wrap justify-end">
        <Badge variant="secondary" data-testid={`links.visits-${link.id}`}>
          {translate("links.visits", { count: link.visitCount })}
        </Badge>
        <span className="text-xs text-muted-foreground" aria-hidden="true">
          {link.enabled ? translate("links.on") : translate("links.off")}
        </span>
        <Switch
          checked={link.enabled}
          disabled={update.isPending}
          onCheckedChange={(enabled) => update.mutate({ enabled })}
          aria-label={translate("links.toggle", { name: link.name })}
          data-testid={`links.toggle-${link.id}`}
        />
        {link.enabled && (
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={
              <Link
                to="/onboarding/link/$linkId"
                params={{ linkId: link.id }}
                search={{ org: orgId, from: location.href }}
                data-testid={`links.show-${link.id}`}
              />
            }
          >
            {translate("links.showQr")}
          </Button>
        )}
        {link.enabled && shortUrl && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void downloadQr(shortUrl, link.name)}
            data-testid={`links.download-${link.id}`}
          >
            <DownloadSimpleIcon data-icon="inline-start" />
            {translate("links.download")}
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
          {translate("links.edit")}
        </Button>
      </ItemActions>
    </Item>
  );
}

export function OnboardingLinks({
  apiClient,
  orgId,
  isActive,
}: {
  apiClient: ApiClient;
  orgId: string;
  isActive: boolean;
}) {
  const translate = useAppTranslation();
  const queryClient = useQueryClient();
  const gatewayOrigin = useGatewayOrigin();
  const [formKey, setFormKey] = useState(0);
  const links = useQuery({ ...onboardingLinksQueryOptions(apiClient, orgId), enabled: isActive });

  const create = useMutation({
    mutationFn: (values: { name: string; destination: string }) =>
      apiClient.createOnboardingLink({ organizationId: orgId, ...values }),
    onSuccess: () => {
      toast.success(translate("links.created"));
      setFormKey((key) => key + 1);
      void queryClient.invalidateQueries({ queryKey: onboardingLinksQueryKey(orgId) });
    },
    onError: (error) => toast.error(appErrorMessage(error, translate)),
  });

  return (
    <section className="flex flex-col gap-4" data-testid="links.section">
      <SectionHeader
        title={translate("links.title")}
        description={translate("links.description")}
      />
      {!isActive ? (
        <p className="text-sm text-muted-foreground" data-testid="links.switch-to-manage">
          {translate("links.switchToManage")}
        </p>
      ) : (
        <>
          <LinkForm
            key={formKey}
            idPrefix="links.create"
            submitLabel={translate("links.create")}
            pending={create.isPending}
            onSubmit={(values) => create.mutate(values)}
          />
          {links.isPending ? (
            <Skeleton className="h-16 w-full" />
          ) : links.isError ? (
            <p role="alert" className="text-sm text-muted-foreground" data-testid="links.error">
              {appErrorMessage(links.error, translate)}
            </p>
          ) : links.data.length > 0 ? (
            <ItemGroup>
              {links.data.map((link, index) => (
                <div key={link.id} className="flex flex-col">
                  {index > 0 && <ItemSeparator />}
                  <LinkRow
                    apiClient={apiClient}
                    orgId={orgId}
                    link={link}
                    gatewayOrigin={gatewayOrigin}
                  />
                </div>
              ))}
            </ItemGroup>
          ) : (
            <EmptyState
              icon={LinkIcon}
              title={translate("links.empty")}
              description={translate("links.emptyDescription")}
              className="py-10"
            />
          )}
        </>
      )}
    </section>
  );
}
