import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Badge, Card, CardContent, UnderConstruction } from "@/components";
import { APP_NAME } from "@/lib/branding";
import { getSessionFromData, sessionQueryOptions } from "@/lib/session";

export const Route = createFileRoute("/_layout/opencode")({
  head: () => ({
    meta: [
      { title: `Opencode | ${APP_NAME}` },
      {
        name: "description",
        content: `Build and edit ${APP_NAME} with opencode — an open-source AI coding agent that understands runtime composition, authClient, and apiClient.`,
      },
    ],
  }),
  component: OpencodePage,
});

function OpencodePage() {
  const sessionQuery = useQuery(sessionQueryOptions());
  const { isAdmin } = getSessionFromData(sessionQuery.data);

  return (
    <div className="space-y-10">
      <section className="space-y-5">
        <Link
          to="/"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors font-mono"
        >
          &larr; back home
        </Link>
        <div className="space-y-4 max-w-3xl">
          <Badge variant="outline">opencode</Badge>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            Build with opencode, see it live
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
            <strong className="text-foreground">opencode</strong> is an open-source AI coding agent.
            When you run it inside this project, it discovers{" "}
            <a
              href="/skill.md"
              className="underline hover:text-foreground transition-colors font-mono"
            >
              skills
            </a>
            ,{" "}
            <a
              href="/llms.txt"
              className="underline hover:text-foreground transition-colors font-mono"
            >
              context
            </a>
            , and <code className="text-xs bg-muted px-1.5 py-0.5 rounded">AGENTS.md</code>{" "}
            automatically.
          </p>
        </div>
      </section>

      <section className="space-y-4 max-w-3xl">
        <UnderConstruction
          label="opencode"
          sourceFile="ui/src/routes/_layout/opencode.tsx"
          className="w-full max-w-sm"
        />
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardContent className="p-5 space-y-2">
              <div className="text-sm font-medium font-mono">how it works</div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Run{" "}
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                  opencode serve --port 4096
                </code>{" "}
                alongside the dev server. It discovers the project skill files and context
                automatically.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 space-y-2">
              <div className="text-sm font-medium font-mono">admin dashboard</div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {isAdmin ? (
                  <Link
                    to="/dashboard"
                    className="underline hover:text-foreground transition-colors"
                  >
                    Open the admin dashboard
                  </Link>
                ) : (
                  "Sign in as an admin to access the interactive dashboard with server controls, prompt box, and config reload."
                )}
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <FactCard
          title="runtime composition"
          body="bos.config.json is the source of truth. The host, UI, and API are loaded from published config, not a single fixed bundle. opencode understands this architecture and edits the living surface."
        />
        <FactCard
          title="skills, not static docs"
          body={
            <>
              Skill files live in{" "}
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded">.opencode/skills/</code> and{" "}
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded">.agent/skills/</code>. They
              make agent knowledge codified, versioned, and auto-discovered.
            </>
          }
        />
        <FactCard
          title="hot reload loop"
          body="Edit a page in opencode, save the file, and watch it update in your browser at localhost:3002. The Module Federation dev server hot-reloads without a full rebuild."
        />
        <FactCard
          title="deploy then restart"
          body={
            <>
              After{" "}
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded">bos publish --deploy</code>{" "}
              updates the config with new CDN URLs, restart the host to pick up changes. The runtime
              is frozen at startup by design.
            </>
          }
        />
      </section>
    </div>
  );
}

function FactCard({ title, body }: { title: string; body: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-5 space-y-2">
        <div className="text-sm font-medium">{title}</div>
        <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
      </CardContent>
    </Card>
  );
}
