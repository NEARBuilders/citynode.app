import { PlusIcon, XIcon } from "@phosphor-icons/react";
import type { ApiClient } from "@/app";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { AppMessageId } from "@/i18n/catalogs";
import { useAppTranslation } from "@/i18n/runtime";

export type DiscoveryProfile = NonNullable<Awaited<ReturnType<ApiClient["getDiscoveryProfile"]>>>;

export function emptyDiscoveryProfile(nodeId: string): DiscoveryProfile {
  return {
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
  };
}

export function validateProfile(profile: DiscoveryProfile): AppMessageId | null {
  for (const channel of profile.channels) {
    if (!channel.label.trim()) return "community.linkNameRequired";
    if (!/^https?:\/\//i.test(channel.url.trim())) return "community.linkUrlRequired";
  }
  return null;
}

export function geocodeHintMessage(hint: string) {
  return hint === "unavailable" || hint.startsWith("Map lookup is unavailable")
    ? "community.geocodeUnavailable"
    : "community.geocodeHint";
}

export function withProfileLocation(profile: DiscoveryProfile, location: string): DiscoveryProfile {
  const trimmed = location.trim();
  const stillMatchesGeocode =
    trimmed.length > 0 && trimmed === (profile.geocodedLocation?.trim() ?? "");
  return {
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
  };
}

export function ProfileFields({
  profile,
  onChange,
}: {
  profile: DiscoveryProfile;
  onChange: (profile: DiscoveryProfile) => void;
}) {
  const translate = useAppTranslation();
  const setChannel = (index: number, patch: Partial<DiscoveryProfile["channels"][number]>) =>
    onChange({
      ...profile,
      channels: profile.channels.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    });
  return (
    <>
      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel htmlFor="profile-published">{translate("community.showExplore")}</FieldLabel>
          <FieldDescription>{translate("community.showExploreHint")}</FieldDescription>
        </FieldContent>
        <Switch
          id="profile-published"
          data-testid="discovery-profile-published"
          checked={profile.published}
          onCheckedChange={(checked) => onChange({ ...profile, published: checked === true })}
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
            onChange={(e) => onChange({ ...profile, summary: e.target.value })}
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
                onChange={(e) => onChange(withProfileLocation(profile, e.target.value))}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="profile-region">{translate("community.region")}</FieldLabel>
              <Input
                id="profile-region"
                data-testid="discovery-profile-region"
                value={profile.region}
                maxLength={120}
                onChange={(e) => onChange({ ...profile, region: e.target.value })}
              />
            </Field>
          </div>
          {profile.geocodeHint ? (
            <p
              role="status"
              data-testid="discovery-profile-geocode-hint"
              className="text-sm text-muted-foreground"
            >
              {translate(geocodeHintMessage(profile.geocodeHint))}
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
                  onChange({
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
              onChange({ ...profile, channels: [...profile.channels, { label: "", url: "" }] })
            }
          >
            <PlusIcon />
            {translate("community.addLink")}
          </Button>
        </FieldGroup>
      </FieldSet>
    </>
  );
}
