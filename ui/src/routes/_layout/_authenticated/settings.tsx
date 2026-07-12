import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { sessionQueryOptions } from "@/app";
import { PageContainer, Tabs, TabsList, TabsTrigger } from "@/components";

export const Route = createFileRoute("/_layout/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings | auth.everything.dev" },
      { name: "description", content: "Manage your account identity and security." },
    ],
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      sessionQueryOptions(context.authClient, context.session),
    );
  },
  component: SettingsLayout,
});

const tabs = [
  { value: "profile", to: "/settings/profile", label: "Profile" },
  { value: "auth-methods", to: "/settings/auth-methods", label: "Auth Methods" },
  { value: "security", to: "/settings/security", label: "Security" },
] as const;

function SettingsLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const activeTab =
    tabs.find((t) => pathname === t.to || pathname.startsWith(`${t.to}/`))?.value ?? "profile";

  return (
    <PageContainer variant="default">
      <div className="space-y-6">
        <header className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Settings size={14} />
            <span>Account</span>
          </div>
          <h1 className="text-xl font-semibold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage your account identity and security settings.
          </p>
        </header>

        <Tabs value={activeTab} className="w-full min-w-0">
          <TabsList className="w-full justify-start overflow-x-auto">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} asChild className="shrink-0">
                <Link to={tab.to}>{tab.label}</Link>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Outlet />
      </div>
    </PageContainer>
  );
}
