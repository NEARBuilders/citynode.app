import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { type ApiClient, useApiClient } from "@/app";
import { Button, Input, Textarea } from "@/components";
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ActivityEditor } from "./activity-editor";

type Profile = NonNullable<Awaited<ReturnType<ApiClient["getDiscoveryProfile"]>>>;
export function ProfileEditor({
  nodeId,
  defaultTab = "profile",
}: {
  nodeId: string;
  defaultTab?: "profile" | "events";
}) {
  const api = useApiClient();
  const query = useQuery({
    queryKey: ["discovery-profile", nodeId],
    queryFn: () => api.getDiscoveryProfile({ nodeId }),
    retry: false,
  });
  if (query.isPending)
    return <p className="text-sm text-muted-foreground">Loading your community…</p>;
  if (query.isError)
    return (
      <p className="text-sm text-muted-foreground">
        Only this community’s owners and admins can change its profile or publish events. Ask an
        owner to give you access.
      </p>
    );
  return (
    <Tabs defaultValue={defaultTab}>
      <TabsList className="mb-4 justify-start">
        <TabsTrigger value="events" data-testid="content-tab-events">
          Events & updates
        </TabsTrigger>
        <TabsTrigger value="profile" data-testid="content-tab-profile">
          Community profile
        </TabsTrigger>
      </TabsList>
      <TabsContent value="profile" className="flex flex-col gap-6">
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
            }
          }
        />
      </TabsContent>
      <TabsContent value="events" className="flex flex-col gap-4">
        {!query.data?.published && (
          <p className="rounded-xl bg-secondary px-4 py-3 text-sm">
            Your community isn’t on Explore yet. You can prepare events now; turn on “Show this
            community on Explore” in Community profile when you’re ready for people to see them.
          </p>
        )}
        <ActivityEditor nodeId={nodeId} />
      </TabsContent>
    </Tabs>
  );
}
function ProfileForm({ initial }: { initial: Profile }) {
  const [profile, setProfile] = useState(initial);
  const api = useApiClient();
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: () => api.saveDiscoveryProfile(profile),
    onSuccess: () =>
      client.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("discovery") }),
  });
  return (
    <form
      className="flex flex-col gap-6 rounded-2xl border border-border bg-card p-5 sm:p-7"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Community profile</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Tell people who you are, where you meet, and how to join. Use a public place for your map
          pin—not someone’s home. If you meet only online, you can skip the map pin.
        </p>
      </div>
      <Field>
        <FieldLabel htmlFor="profile-summary">About this community</FieldLabel>
        <Textarea
          id="profile-summary"
          value={profile.summary}
          placeholder="Who is this community for? What do you do together?"
          maxLength={1000}
          onChange={(e) => setProfile({ ...profile, summary: e.target.value })}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="profile-location">Location</FieldLabel>
          <Input
            id="profile-location"
            value={profile.location}
            maxLength={120}
            onChange={(e) => setProfile({ ...profile, location: e.target.value })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="profile-region">Region</FieldLabel>
          <Input
            id="profile-region"
            value={profile.region}
            maxLength={120}
            onChange={(e) => setProfile({ ...profile, region: e.target.value })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="profile-latitude">Latitude</FieldLabel>
          <Input
            id="profile-latitude"
            type="number"
            step="any"
            min={-85}
            max={85}
            value={profile.latitude ?? ""}
            onChange={(e) =>
              setProfile({
                ...profile,
                latitude: e.target.value === "" ? null : Number(e.target.value),
              })
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="profile-longitude">Longitude</FieldLabel>
          <Input
            id="profile-longitude"
            type="number"
            step="any"
            min={-180}
            max={180}
            value={profile.longitude ?? ""}
            onChange={(e) =>
              setProfile({
                ...profile,
                longitude: e.target.value === "" ? null : Number(e.target.value),
              })
            }
          />
        </Field>
      </div>
      <FieldSet>
        <FieldLegend>Where people can join you</FieldLegend>
        <FieldDescription>Add your website, group chat, or social page.</FieldDescription>
        {profile.channels.map((channel, index) => (
          <div key={index} className="flex flex-wrap items-end gap-3 rounded-xl bg-muted/40 p-3">
            <Field>
              <FieldLabel htmlFor={`channel-label-${index}`}>Link name</FieldLabel>
              <Input
                id={`channel-label-${index}`}
                required
                value={channel.label}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    channels: profile.channels.map((c, i) =>
                      i === index ? { ...c, label: e.target.value } : c,
                    ),
                  })
                }
              />
            </Field>
            <Field className="min-w-48 flex-1">
              <FieldLabel htmlFor={`channel-url-${index}`}>Website or group</FieldLabel>
              <Input
                id={`channel-url-${index}`}
                required
                type="url"
                value={channel.url}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    channels: profile.channels.map((c, i) =>
                      i === index ? { ...c, url: e.target.value } : c,
                    ),
                  })
                }
              />
            </Field>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setProfile({ ...profile, channels: profile.channels.filter((_, i) => i !== index) })
              }
            >
              Remove
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          disabled={profile.channels.length >= 10}
          onClick={() =>
            setProfile({ ...profile, channels: [...profile.channels, { label: "", url: "" }] })
          }
        >
          Add a link
        </Button>
      </FieldSet>
      <Field orientation="horizontal">
        <Switch
          id="profile-published"
          checked={profile.published}
          onCheckedChange={(checked) => setProfile({ ...profile, published: checked })}
        />
        <FieldLabel htmlFor="profile-published">Show this community on Explore</FieldLabel>
      </Field>
      <Button data-testid="discovery-profile-save" disabled={save.isPending}>
        Save profile
      </Button>
      {save.isError && <p role="alert">{save.error.message}</p>}
      {save.isSuccess && <p role="status">Profile saved.</p>}
    </form>
  );
}
