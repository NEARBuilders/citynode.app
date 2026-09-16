import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { type ApiClient, useApiClient } from "@/app";
import { Button, Input, Textarea } from "@/components";
import { ActivityEditor } from "./activity-editor";
import { DiscoveryHistory } from "./discovery-studio";

type Profile = NonNullable<Awaited<ReturnType<ApiClient["getDiscoveryProfile"]>>>;
export function ProfileEditor({ nodeId }: { nodeId: string }) {
  const api = useApiClient();
  const query = useQuery({
    queryKey: ["discovery-profile", nodeId],
    queryFn: () => api.getDiscoveryProfile({ nodeId }),
    retry: false,
  });
  if (query.isPending) return <p>Loading discovery profile…</p>;
  if (query.isError)
    return (
      <p>
        Discovery publishing requires an organization owner, administrator, or platform
        administrator.
      </p>
    );
  return (
    <>
      {" "}
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
      <ActivityEditor nodeId={nodeId} />
      <DiscoveryHistory nodeId={nodeId} />
    </>
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
      className="space-y-4 rounded-xl border border-border p-5"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <h2 className="text-xl font-semibold">Discovery profile</h2>
      <p className="text-sm text-muted-foreground">
        Confirm an approximate city or regional center. Leave coordinates blank for an online-only
        community.
      </p>
      <label className="block" htmlFor="profile-editor-1">
        Community summary
        <Textarea
          id="profile-editor-1"
          value={profile.summary}
          maxLength={1000}
          onChange={(e) => setProfile({ ...profile, summary: e.target.value })}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label htmlFor="profile-editor-2">
          Location
          <Input
            id="profile-editor-2"
            value={profile.location}
            maxLength={120}
            onChange={(e) => setProfile({ ...profile, location: e.target.value })}
          />
        </label>
        <label htmlFor="profile-editor-3">
          Region
          <Input
            id="profile-editor-3"
            value={profile.region}
            maxLength={120}
            onChange={(e) => setProfile({ ...profile, region: e.target.value })}
          />
        </label>
        <label htmlFor="profile-editor-4">
          Latitude
          <Input
            id="profile-editor-4"
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
        </label>
        <label htmlFor="profile-editor-5">
          Longitude
          <Input
            id="profile-editor-5"
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
        </label>
      </div>
      <fieldset className="space-y-3">
        <legend>Official channels</legend>
        {profile.channels.map((channel, index) => (
          <div key={index} className="flex flex-wrap gap-2">
            <label htmlFor={`channel-label-${index}`}>
              Channel name
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
            </label>
            <label htmlFor={`channel-url-${index}`}>
              Channel URL
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
            </label>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setProfile({ ...profile, channels: profile.channels.filter((_, i) => i !== index) })
              }
            >
              Remove channel
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
          Add channel
        </Button>
      </fieldset>
      <label className="flex gap-2">
        <input
          type="checkbox"
          checked={profile.published}
          onChange={(e) => setProfile({ ...profile, published: e.target.checked })}
        />
        Publish in discovery
      </label>
      <Button data-testid="discovery-profile-save" disabled={save.isPending}>
        Save discovery profile
      </Button>
      {save.isError && <p role="alert">{save.error.message}</p>}
      {save.isSuccess && <p role="status">Discovery profile saved.</p>}
    </form>
  );
}
