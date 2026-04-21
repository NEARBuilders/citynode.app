import { createFileRoute, Link } from "@tanstack/react-router";
import { Badge, Card, CardContent, UnderConstruction } from "@/components";
import { APP_NAME } from "@/lib/branding";

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
            automatically — so it already knows about the host, UI, and API composition, the
            available clients, and how to add pages.
          </p>
          <UnderConstruction
            label="opencode"
            sourceFile="ui/src/routes/_layout/opencode.tsx"
            className="w-full max-w-sm mt-3"
          />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              how it works
            </div>
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                1.{" "}
                <a
                  href="https://opencode.ai"
                  className="underline hover:text-foreground transition-colors"
                >
                  install opencode
                </a>{" "}
                and run it inside this project
              </p>
              <p>
                2. opencode discovers{" "}
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">AGENTS.md</code>,{" "}
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">LLM.txt</code>, and skill
                files — no manual setup needed
              </p>
              <p>
                3. start the dev server with{" "}
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                  bos dev --host remote
                </code>{" "}
                — UI loads on <code className="text-xs bg-muted px-1.5 py-0.5 rounded">:3002</code>,
                API on <code className="text-xs bg-muted px-1.5 py-0.5 rounded">:3014</code>
              </p>
              <p>
                4. prompt opencode to edit a page — changes hot-reload in your browser, no rebuild
              </p>
              <p>
                5. when ready to ship:{" "}
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">bos publish --deploy</code>{" "}
                uploads to Zephyr CDN and updates{" "}
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">bos.config.json</code> with
                new URLs
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">start here</div>
            <div className="grid gap-3">
              <BoxLink
                href="/about"
                title="about this site"
                body="understand the host–UI–API composition model and published runtime records"
              />
              <BoxLink
                href="/apps"
                title="browse published apps"
                body="inspect accounts, gateways, remotes, and public runtime metadata"
              />
              <BoxLink
                href="/skill.md"
                title="open the agent guide"
                body="task-oriented notes for agents, crawlers, and AI-native clients"
              />
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4 max-w-3xl">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">key clients</div>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardContent className="p-5 space-y-2">
              <div className="text-sm font-medium font-mono">authClient</div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Imported from <code className="text-xs bg-muted px-1.5 py-0.5 rounded">@/app</code>.
                Provides NEAR Sign In (SIWN), email/password, and anonymous auth via Better-Auth.
                Use{" "}
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                  authClient.getSession()
                </code>{" "}
                to check sessions.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 space-y-2">
              <div className="text-sm font-medium font-mono">apiClient</div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Accessed via the{" "}
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">useApiClient()</code> hook
                from{" "}
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">@/lib/use-api-client</code>
                . Returns a fully typed oRPC client connected to the host. Combine with TanStack
                Query for data fetching.
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
              make agent knowledge codified, versioned, and auto-discovered — no manual context
              pasting needed.
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
              is frozen at startup by design — a fresh process loads the latest composition.
            </>
          }
        />
      </section>

      <section className="space-y-4 max-w-3xl">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          programmatic access
        </div>
        <Card>
          <CardContent className="p-5 space-y-3">
            <p className="text-sm leading-relaxed text-muted-foreground">
              opencode can run as an HTTP server for programmatic access. Run{" "}
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                opencode serve --port 4096
              </code>{" "}
              alongside the dev server, then send prompts via the{" "}
              <a
                href="https://opencode.ai/docs/sdk/"
                className="underline hover:text-foreground transition-colors"
              >
                JS SDK
              </a>{" "}
              or HTTP API:
            </p>
            <pre className="overflow-x-auto text-xs leading-relaxed text-muted-foreground font-mono whitespace-pre">
              {`# Create a session and send a prompt
curl -X POST http://localhost:4096/session \\
  -H "Content-Type: application/json" \\
  -d '{"title":"edit page"}'

# Or use the SDK
import { createOpencode } from "@opencode-ai/sdk";
const { client } = await createOpencode({ port: 4096 });`}
            </pre>
            <p className="text-sm leading-relaxed text-muted-foreground">
              This enables future integrations where the site itself could prompt opencode to make
              changes — the{" "}
              <a
                href="/skill.md"
                className="underline hover:text-foreground transition-colors font-mono"
              >
                skill
              </a>{" "}
              and{" "}
              <a
                href="/llms.txt"
                className="underline hover:text-foreground transition-colors font-mono"
              >
                agent context
              </a>{" "}
              files provide the knowledge for the agent to work effectively.
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4 max-w-3xl">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          command reference
        </div>
        <Card>
          <CardContent className="p-4 sm:p-6">
            <pre className="overflow-x-auto text-xs leading-relaxed text-muted-foreground font-mono whitespace-pre">
              {`# start dev (remote host, local UI + API)
bos dev --host remote

# isolate UI work
bos dev --api remote

# isolate API work
bos dev --ui remote

# production preview
bos start --no-interactive

# build, deploy to Zephyr CDN, update config
bos publish --deploy

# restart after deploy
bos kill && bos dev --host remote

# Docker
docker build -t everything-dev .
docker run -p 3000:3000 everything-dev

# type check
bun typecheck`}
            </pre>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function BoxLink({ title, body, href }: { title: string; body: string; href: string }) {
  const isStaticFile = /\.(md|txt|json)$/i.test(href);

  if (isStaticFile) {
    return (
      <a href={href}>
        <Card className="transition-colors hover:bg-muted/20">
          <CardContent className="p-4 space-y-1">
            <div className="font-medium">{title}</div>
            <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
          </CardContent>
        </Card>
      </a>
    );
  }

  return (
    <Link to={href}>
      <Card className="transition-colors hover:bg-muted/20">
        <CardContent className="p-4 space-y-1">
          <div className="font-medium">{title}</div>
          <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
        </CardContent>
      </Card>
    </Link>
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
