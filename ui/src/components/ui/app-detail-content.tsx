import { AppDetailConfig } from "./app-detail-config";
import { AppDetailHeader } from "./app-detail-header";
import { AppDetailMetadataEditor } from "./app-detail-metadata-editor";
import { AppDetailRuntime } from "./app-detail-runtime";
import type { AppDetailContentProps } from "./app-detail-types";

export type { AppDetailContentProps } from "./app-detail-types";

export function AppDetailContent({
  accountId,
  gatewayId,
  app,
  statusQuery,
}: AppDetailContentProps) {
  return (
    <div className="space-y-6 min-w-0">
      <AppDetailHeader accountId={accountId} gatewayId={gatewayId} app={app} />
      <AppDetailRuntime accountId={accountId} gatewayId={gatewayId} app={app} />
      <AppDetailConfig app={app} />
      <AppDetailMetadataEditor
        accountId={accountId}
        gatewayId={gatewayId}
        app={app}
        statusQuery={statusQuery}
      />
    </div>
  );
}
