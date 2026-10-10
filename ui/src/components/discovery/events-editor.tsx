import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useApiClient } from "@/app";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppTranslation } from "@/i18n/runtime";
import { ActivityEditor } from "./activity-editor";
import { discoveryProfileQueryOptions } from "./profile-editor";

export function EventsEditor({
  nodeId,
  profileLink,
}: {
  nodeId: string;
  profileLink?: ReactElement;
}) {
  const translate = useAppTranslation();
  const api = useApiClient();
  const profile = useQuery(discoveryProfileQueryOptions(api, nodeId));
  return (
    <div className="flex flex-col gap-8">
      {profile.isSuccess && !profile.data?.published && (
        <div
          className="flex flex-wrap items-center gap-3 text-sm"
          data-testid="content-not-published"
        >
          <Badge variant="warning">{translate("community.hidden")}</Badge>
          <span className="text-muted-foreground">{translate("community.hiddenHint")}</span>
          {profileLink && (
            <Button
              variant="link"
              size="xs"
              nativeButton={false}
              render={profileLink}
              data-testid="content-open-profile"
            >
              {translate("community.openProfile")}
            </Button>
          )}
        </div>
      )}
      <ActivityEditor nodeId={nodeId} />
    </div>
  );
}
