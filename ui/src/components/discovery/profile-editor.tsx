import { LockSimpleIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { type ApiClient, useApiClient } from "@/app";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { AppMessageId, AppTranslator } from "@/i18n/catalogs";
import { appErrorMessage } from "@/i18n/error-message";
import { useAppTranslation } from "@/i18n/runtime";
import { ActivityEditor } from "./activity-editor";

type Profile = NonNullable<Awaited<ReturnType<ApiClient["getDiscoveryProfile"]>>>;
export type ProfileEditorTab = "profile" | "events";

function profileSaveErrorMessage(error: unknown, t: AppTranslator) {
  return appErrorMessage(error, t, "community.saveError");
}

function validateProfile(profile: Profile): AppMessageId | null {
  for (const channel of profile.channels) {
    if (!channel.label.trim()) return "community.linkNameRequired";
    if (!/^https?:\/\//i.test(channel.url.trim())) return "community.linkUrlRequired";
  }
  return null;
}

export function ProfileEditor({
  nodeId,
  defaultTab = "profile",
  tab,
  onTabChange,
}: {
  nodeId: string;
  defaultTab?: ProfileEditorTab;
  tab?: ProfileEditorTab;
  onTabChange?: (tab: ProfileEditorTab) => void;
}) {
  const translate = useAppTranslation();
  const api = useApiClient();
  const [localTab, setLocalTab] = useState<ProfileEditorTab>(defaultTab);
  const current = tab ?? localTab;
  const select = (next: ProfileEditorTab) => {
    setLocalTab(next);
    onTabChange?.(next);
  };
  const query = useQuery({
    queryKey: ["discovery-profile", nodeId],
    queryFn: () => api.getDiscoveryProfile({ nodeId }),
    retry: false,
  });
  if (query.isPending)
    return (
      <div className="flex flex-col gap-8">
        <Skeleton className="h-11 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (query.isError)
    return (
      <EmptyState
        icon={LockSimpleIcon}
        title={translate("community.cannotEdit")}
        description={translate("community.cannotEditHint")}
      />
    );
  return (
    <Tabs
      value={current}
      onValueChange={(value) => select(value === "profile" ? "profile" : "events")}
    >
      <TabsList>
        <TabsTrigger value="events" data-testid="content-tab-events">
          {translate("events.title")}
        </TabsTrigger>
        <TabsTrigger value="profile" data-testid="content-tab-profile">
          {translate("community.profile")}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="events" className="flex flex-col gap-8 pt-8">
        {!query.data?.published && (
          <div
            className="flex flex-wrap items-center gap-3 text-sm"
            data-testid="content-not-published"
          >
            <Badge variant="warning">{translate("community.hidden")}</Badge>
            <span className="text-muted-foreground">{translate("community.hiddenHint")}</span>
            <Button variant="link" size="xs" onClick={() => select("profile")}>
              {translate("community.openProfile")}
            </Button>
          </div>
        )}
        <ActivityEditor nodeId={nodeId} />
      </TabsContent>
      <TabsContent value="profile" className="pt-8">
        <ProfileForm
          key={nodeId}
          initial={
            query.data ?? {
              nodeId,
              summary: "",
              location: "",
              region: "",
              latitude: null,
              longitude: null,
              channels: [],
              published: false,
              geocodedLocation: null,
              geocodeHint: null,
            }
          }
        />
      </TabsContent>
    </Tabs>
  );
}

function ProfileForm({ initial }: { initial: Profile }) {
  const translate = useAppTranslation();
  const [profile, setProfile] = useState(initial);
  const [validationError, setValidationError] = useState<AppMessageId | null>(null);
  const api = useApiClient();
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: () => api.saveDiscoveryProfile(profile),
    onSuccess: (saved) => {
      setValidationError(null);
      setProfile(saved);
      if (saved.geocodeHint) {
        toast.warning(translate("community.geocodeHint"));
      } else {
        toast.success(
          saved.published
            ? translate("community.profileSavedPublished")
            : translate("community.profileSaved"),
        );
      }
      return client.invalidateQueries({
        predicate: (q) => String(q.queryKey[0]).startsWith("discovery"),
      });
    },
    onError: (error: unknown) => toast.error(profileSaveErrorMessage(error, translate)),
  });
  const setChannel = (index: number, patch: Partial<Profile["channels"][number]>) =>
    setProfile({
      ...profile,
      channels: profile.channels.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    });
  const setLocation = (location: string) => {
    const trimmed = location.trim();
    const stillMatchesGeocode =
      trimmed.length > 0 && trimmed === (profile.geocodedLocation?.trim() ?? "");
    setProfile({
      ...profile,
      location,
      ...(trimmed
        ? stillMatchesGeocode
          ? {}
          : { geocodedLocation: null, geocodeHint: null }
        : {
            latitude: null,
            longitude: null,
            geocodedLocation: null,
            geocodeHint: null,
          }),
    });
  };
  return (
    <form
      className="flex max-w-2xl flex-col gap-10"
      noValidate
      data-testid="discovery-profile-form"
      onSubmit={(e) => {
        e.preventDefault();
        const issue = validateProfile(profile);
        if (issue) {
          setValidationError(issue);
          toast.error(translate(issue));
          return;
        }
        setValidationError(null);
        save.mutate();
      }}
    >
      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel htmlFor="profile-published">{translate("community.showExplore")}</FieldLabel>
          <FieldDescription>{translate("community.showExploreHint")}</FieldDescription>
        </FieldContent>
        <Switch
          id="profile-published"
          data-testid="discovery-profile-published"
          checked={profile.published}
          onCheckedChange={(checked) => setProfile({ ...profile, published: checked === true })}
        />
      </Field>

      <FieldSet>
        <FieldLegend>{translate("about.title")}</FieldLegend>
        <Field>
          <FieldLabel htmlFor="profile-summary">{translate("common.description")}</FieldLabel>
          <Textarea
            id="profile-summary"
            data-testid="discovery-profile-summary"
            value={profile.summary}
            placeholder={translate("community.profileExample")}
            maxLength={1000}
            onChange={(e) => setProfile({ ...profile, summary: e.target.value })}
          />
        </Field>
      </FieldSet>

      <FieldSet>
        <FieldLegend>{translate("community.whereMeet")}</FieldLegend>
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="profile-location">
                {translate("community.cityExample")}
              </FieldLabel>
              <Input
                id="profile-location"
                data-testid="discovery-profile-location"
                value={profile.location}
                maxLength={120}
                onChange={(e) => setLocation(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="profile-region">{translate("community.region")}</FieldLabel>
              <Input
                id="profile-region"
                data-testid="discovery-profile-region"
                value={profile.region}
                maxLength={120}
                onChange={(e) => setProfile({ ...profile, region: e.target.value })}
              />
            </Field>
          </div>
          {profile.geocodeHint ? (
            <p
              role="status"
              data-testid="discovery-profile-geocode-hint"
              className="text-sm text-muted-foreground"
            >
              {translate("community.geocodeHint")}
            </p>
          ) : null}
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend>{translate("community.joinLinks")}</FieldLegend>
        <FieldGroup>
          {profile.channels.map((channel, index) => (
            <div key={index} className="flex flex-wrap items-end gap-2 sm:flex-nowrap">
              <Field className="w-full sm:w-36 sm:shrink-0">
                <FieldLabel htmlFor={`channel-label-${index}`}>
                  {translate("common.name")}
                </FieldLabel>
                <Input
                  id={`channel-label-${index}`}
                  data-testid={`discovery-profile-channel-label-${index}`}
                  placeholder="Telegram"
                  value={channel.label}
                  onChange={(e) => setChannel(index, { label: e.target.value })}
                />
              </Field>
              <Field className="min-w-0 flex-1">
                <FieldLabel htmlFor={`channel-url-${index}`}>{translate("common.link")}</FieldLabel>
                <Input
                  id={`channel-url-${index}`}
                  data-testid={`discovery-profile-channel-url-${index}`}
                  type="url"
                  placeholder="https://"
                  value={channel.url}
                  onChange={(e) => setChannel(index, { url: e.target.value })}
                />
              </Field>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={translate("common.removeNamed", {
                  name: channel.label || translate("community.linkFallback"),
                })}
                onClick={() =>
                  setProfile({
                    ...profile,
                    channels: profile.channels.filter((_, i) => i !== index),
                  })
                }
              >
                <XIcon />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            data-testid="discovery-profile-add-channel"
            disabled={profile.channels.length >= 10}
            onClick={() =>
              setProfile({ ...profile, channels: [...profile.channels, { label: "", url: "" }] })
            }
          >
            <PlusIcon />
            {translate("community.addLink")}
          </Button>
        </FieldGroup>
      </FieldSet>

      <div className="flex flex-col gap-2">
        <Button
          type="submit"
          data-testid="discovery-profile-save"
          className="self-start"
          disabled={save.isPending}
        >
          {save.isPending ? translate("common.saving") : translate("community.saveProfile")}
        </Button>
        {(validationError || save.isError) && (
          <p
            role="alert"
            data-testid="discovery-profile-save-error"
            className="text-sm text-destructive"
          >
            {validationError
              ? translate(validationError)
              : profileSaveErrorMessage(save.error, translate)}
          </p>
        )}
      </div>
    </form>
  );
}
