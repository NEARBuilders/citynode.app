import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Badge, Button, Card, CardContent, Input, UnderConstruction } from "@/components";
import { APP_NAME } from "@/lib/branding";
import { useApiClient } from "@/lib/use-api-client";

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
  const isAdmin = true; // TODO: restore after testing → const { isAdmin } = getSessionFromData(sessionQuery.data);

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
            <a href="/skill.md" className="underline hover:text-foreground transition-colors font-mono">
              skills
            </a>
            ,{" "}
            <a href="/llms.txt" className="underline hover:text-foreground transition-colors font-mono">
              context
            </a>
            , and <code className="text-xs bg-muted px-1.5 py-0.5 rounded">AGENTS.md</code>{" "}
            automatically.
          </p>
        </div>
      </section>

      {isAdmin ? <AdminDashboard /> : <PublicInfo />}

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

function AdminDashboard() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();

  const statusQuery = useQuery({
    queryKey: ["opencode", "serverStatus"],
    queryFn: async () => {
      const { data } = await apiClient.opencode.serverStatus();
      return data;
    },
    refetchInterval: 15000,
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.opencode.startServer();
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["opencode", "serverStatus"] });
    },
  });

  const reloadConfigMutation = useMutation({
    mutationFn: async () => {
      return await apiClient.reloadConfig();
    },
  });

  return (
    <div className="space-y-6">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        admin dashboard
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <ServerPanel
          status={statusQuery.data}
          isLoading={statusQuery.isLoading}
          onStart={() => startMutation.mutate()}
          startResult={startMutation.data}
          startPending={startMutation.isPending}
        />
        <ConfigPanel
          onReload={() => reloadConfigMutation.mutate()}
          result={reloadConfigMutation.data}
          pending={reloadConfigMutation.isPending}
        />
      </div>

      <PromptPanel />
    </div>
  );
}

function ServerPanel({
  status,
  isLoading,
  onStart,
  startResult,
  startPending,
}: {
  status: { running: boolean; port: number; host: string; url: string; version?: string; uptime?: number } | undefined;
  isLoading: boolean;
  onStart: () => void;
  startResult: { status: string; url: string; message: string } | undefined;
  startPending: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            opencode server
          </div>
          {status?.running ? (
            <Badge variant="outline" className="text-green-600 border-green-600/30 bg-green-600/10">
              running
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              not running
            </Badge>
          )}
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Checking server status…</p>
        ) : status ? (
          <div className="space-y-2 text-sm">
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <span className="text-muted-foreground">url</span>
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{status.url}</code>
              <span className="text-muted-foreground">host</span>
              <span>{status.host}</span>
              <span className="text-muted-foreground">port</span>
              <span>{status.port}</span>
              {status.version && (
                <>
                  <span className="text-muted-foreground">version</span>
                  <span>{status.version}</span>
                </>
              )}
              {status.uptime !== undefined && (
                <>
                  <span className="text-muted-foreground">uptime</span>
                  <span>{Math.floor(status.uptime)}s</span>
                </>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Server status unavailable.</p>
        )}

        <div className="flex items-center gap-3">
          <Button size="sm" onClick={onStart} disabled={startPending}>
            {startPending ? "starting…" : "check server"}
          </Button>
          {startResult && (
            <p className="text-xs text-muted-foreground">{startResult.message}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ConfigPanel({
  onReload,
  result,
  pending,
}: {
  onReload: () => void;
  result: { status: string; note: string } | undefined;
  pending: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          host config reload
        </div>
        <p className="text-sm text-muted-foreground">
          Re-fetch the published config from FastKV and signal a scope rebuild. Currently a full host
          restart is needed to pick up changes.
        </p>
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={onReload} disabled={pending}>
            {pending ? "reloading…" : "reload config"}
          </Button>
          {result && (
            <div className="text-xs text-muted-foreground">
              <Badge variant="outline">{result.status}</Badge>
              <span className="ml-2">{result.note}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PromptPanel() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const [prompt, setPrompt] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);

  const createSessionMutation = useMutation({
    mutationFn: async (title?: string) => {
      const { data } = await apiClient.opencode.createSession({ title });
      return data;
    },
    onSuccess: (data) => {
      setSessionId(data.id);
      queryClient.invalidateQueries({ queryKey: ["opencode", "serverStatus"] });
    },
  });

  const sendPromptMutation = useMutation({
    mutationFn: async ({ sid, msg }: { sid: string; msg: string }) => {
      const { data } = await apiClient.opencode.sendPrompt({
        sessionId: sid,
        message: msg,
      });
      return data;
    },
  });

  function handleSend() {
    const msg = prompt.trim();
    if (!msg) return;

    const sid = sessionId;
    if (!sid) {
      createSessionMutation.mutate(msg.slice(0, 80), {
        onSuccess: (session) => {
          setMessages((prev) => [...prev, { role: "user", content: msg }]);
          sendPromptMutation.mutate({ sid: session.id, msg });
          setPrompt("");
        },
      });
    } else {
      setMessages((prev) => [...prev, { role: "user", content: msg }]);
      sendPromptMutation.mutate({ sid, msg });
      setPrompt("");
    }
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">prompt</div>
          {sessionId && (
            <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {sessionId.slice(0, 12)}…
            </code>
          )}
        </div>

        {messages.length > 0 && (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {messages.map((m, i) => (
              <div key={i} className="text-sm">
                <span className="text-xs text-muted-foreground font-mono mr-2">
                  {m.role === "user" ? ">" : "<"}
                </span>
                {m.content}
              </div>
            ))}
            {sendPromptMutation.isPending && (
              <div className="text-sm text-muted-foreground animate-pulse">thinking…</div>
            )}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-2"
        >
          <Input
            placeholder={sessionId ? "send a prompt…" : "type a prompt to create a session…"}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="flex-1 text-sm"
          />
          <Button type="submit" size="sm" disabled={!prompt.trim() || sendPromptMutation.isPending}>
            send
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function PublicInfo() {
  return (
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
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded">opencode serve --port 4096</code>{" "}
              alongside the dev server. It discovers the project skill files and context automatically.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 space-y-2">
            <div className="text-sm font-medium font-mono">admin access</div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Sign in as an admin to see the interactive dashboard with server controls, prompt box,
              and config reload.
            </p>
          </CardContent>
        </Card>
      </div>
    </section>
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