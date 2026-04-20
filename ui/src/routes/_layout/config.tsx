import { createFileRoute } from "@tanstack/react-router";
import { getActiveRuntime } from "@/app";
import { Card, CardContent, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components";
import { APP_NAME } from "@/lib/branding";
import { Route as RootRoute } from "../__root";

export const Route = createFileRoute("/_layout/config")({
  head: () => ({
    meta: [
      { title: `Config | ${APP_NAME}` },
      {
        name: "description",
        content: `Resolved runtime configuration for the active ${APP_NAME} runtime.`,
      },
    ],
  }),
  component: ConfigPage,
});

function ConfigPage() {
  const { runtimeConfig } = RootRoute.useLoaderData();
  const activeRuntime = getActiveRuntime(runtimeConfig);
  const contextualConfig = runtimeConfig ?? null;
  const defaultTab = "runtime-context";

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">config</div>
        <h1 className="text-2xl font-semibold tracking-tight break-all">
          {activeRuntime
            ? `${activeRuntime.accountId}/${activeRuntime.gatewayId}`
            : (runtimeConfig?.account ?? "runtime")}
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Resolved runtime configuration for the active host context.
        </p>
      </section>

      <Tabs defaultValue={defaultTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="runtime-context">route context</TabsTrigger>
        </TabsList>

        <TabsContent value="runtime-context">
          <Card>
            <CardContent className="space-y-3 p-4 sm:p-6">
              <p className="text-sm text-muted-foreground leading-relaxed">
                Full runtime config passed through route context, including runtime metadata.
              </p>
              <pre className="overflow-x-auto whitespace-pre text-xs leading-relaxed text-muted-foreground font-mono">
                {JSON.stringify(contextualConfig, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
