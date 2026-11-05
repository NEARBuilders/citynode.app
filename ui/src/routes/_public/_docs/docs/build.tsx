import {
  ArrowUpRightIcon,
  BookOpenIcon,
  BracketsCurlyIcon,
  CaretRightIcon,
  FileTextIcon,
  GitBranchIcon,
  KeyIcon,
  ListChecksIcon,
  MapTrifoldIcon,
  PlugsConnectedIcon,
  SignpostIcon,
  SparkleIcon,
} from "@phosphor-icons/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { getAccount, getActiveRuntime, getAppName, getRepository, pluginPath } from "@/app";
import { PageContainer, PageHeader } from "@/components";
import { resolveAppLocale, translateAppMessage, useAppTranslation } from "@/i18n/runtime";
import { pageTitle } from "@/lib/page-title";

export const Route = createFileRoute("/_public/_docs/docs/build")({
  loader: ({ context }) => ({ runtimeConfig: context.runtimeConfig }),
  head: ({ match }) => ({
    meta: [
      {
        title: pageTitle(
          translateAppMessage(
            "docs.nav.builders",
            undefined,
            resolveAppLocale(undefined, match.context.locale),
          ),
          match.context.runtimeConfig,
        ),
      },
      {
        name: "description",
        content: translateAppMessage(
          "meta.docsBuildDescription",
          undefined,
          resolveAppLocale(undefined, match.context.locale),
        ),
      },
    ],
  }),
  component: DocsBuild,
});

function parseGithubRepo(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/.*)?$/i);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

function DocsBuild() {
  const translate = useAppTranslation();
  const { runtimeConfig } = Route.useLoaderData();
  const runtime = getActiveRuntime(runtimeConfig);
  const accountId = runtime?.accountId ?? getAccount(runtimeConfig);
  const appName = getAppName(runtimeConfig);
  const repository = getRepository(runtimeConfig);
  const githubRepo = repository ? parseGithubRepo(repository) : null;
  const githubUrl = githubRepo ? `https://github.com/${githubRepo.owner}/${githubRepo.repo}` : null;

  return (
    <PageContainer variant="default">
      <PageHeader
        headerTestId="docs.build-heading"
        icon={BookOpenIcon}
        label={translate("docs.nav.build")}
        title={translate("docs.title", { name: appName ?? "" })}
        description={translate("docs.description")}
      />

      <DocSection title={translate("docs.agents")}>
        <DocLink
          to="/skill"
          icon={<SparkleIcon className="size-5" />}
          title={translate("docs.skill")}
          meta={translate("skill.runMeta")}
          testId="docs.skill-link"
        />
        <DocLink
          href="/skill.md"
          icon={<FileTextIcon className="size-5" />}
          title="skill.md"
          meta={translate("skill.rawMeta")}
        />
        <DocLink
          href="/llms.txt"
          icon={<FileTextIcon className="size-5" />}
          title="llms.txt"
          meta={translate("docs.llmsMeta")}
        />
      </DocSection>

      <DocSection title={translate("docs.api")}>
        <DocLink
          href="/api"
          icon={<BracketsCurlyIcon className="size-5" />}
          title={translate("docs.apiReference")}
          meta={translate("docs.apiReferenceMeta")}
        />
        <DocLink
          href="/.well-known/mcp.json"
          icon={<PlugsConnectedIcon className="size-5" />}
          title="MCP"
          meta={translate("docs.mcpMeta")}
        />
        <DocLink
          to={pluginPath("/settings/api-keys")}
          icon={<KeyIcon className="size-5" />}
          title={translate("docs.apiKeys")}
          meta={translate("docs.apiKeysMeta")}
          testId="docs.api-keys-link"
        />
      </DocSection>

      {repository && (
        <DocSection title={translate("docs.source")}>
          <DocLink
            href={repository}
            icon={<GitBranchIcon className="size-5" />}
            title={
              githubRepo ? `${githubRepo.owner}/${githubRepo.repo}` : translate("common.repository")
            }
            meta={githubRepo ? "GitHub" : repository}
          />
          {githubRepo && (
            <DocLink
              href={`${githubUrl}/blob/main/docs/runtime-map.md`}
              icon={<MapTrifoldIcon className="size-5" />}
              title={translate("docs.runtimeMap")}
              meta={translate("docs.runtimeMapMeta")}
            />
          )}
        </DocSection>
      )}

      {githubRepo && (
        <DocSection title={translate("docs.contribute")}>
          <DocLink
            href={`${githubUrl}/issues`}
            icon={<ListChecksIcon className="size-5" />}
            title={translate("docs.issues")}
            meta={translate("docs.issuesMeta")}
          />
          <DocLink
            href={`${githubUrl}/blob/main/docs/agents/change-placement.md`}
            icon={<SignpostIcon className="size-5" />}
            title={translate("docs.changePlacement")}
            meta={translate("docs.changePlacementMeta")}
          />
        </DocSection>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium text-foreground">{translate("common.runtime")}</h2>
        <dl className="flex flex-col gap-3 text-sm">
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">{translate("common.account")}</dt>
            <dd className="font-mono break-all text-foreground">{accountId}</dd>
          </div>
          {runtime?.gatewayId && (
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground">{translate("common.gateway")}</dt>
              <dd className="font-mono break-all text-foreground">{runtime.gatewayId}</dd>
            </div>
          )}
        </dl>
      </section>
    </PageContainer>
  );
}

function DocSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-medium text-foreground">{title}</h2>
      <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border">
        {children}
      </ul>
    </section>
  );
}

function DocLink({
  to,
  href,
  icon,
  title,
  meta,
  testId,
}: {
  to?: "/skill" | ReturnType<typeof pluginPath>;
  href?: string;
  icon: ReactNode;
  title: string;
  meta: string;
  testId?: string;
}) {
  const className =
    "group flex min-h-16 items-center gap-3 bg-card px-4 py-3 transition-colors hover:bg-muted";
  const content = (
    <>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground group-hover:bg-background">
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="truncate font-medium text-foreground">{title}</div>
        <div className="truncate text-sm text-muted-foreground">{meta}</div>
      </div>
      {to ? (
        <CaretRightIcon className="size-4 text-muted-foreground" />
      ) : (
        <ArrowUpRightIcon className="size-4 text-muted-foreground" />
      )}
    </>
  );
  return (
    <li>
      {to ? (
        <Link to={to} preload="intent" className={className} data-testid={testId}>
          {content}
        </Link>
      ) : (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={className}
          data-testid={testId}
        >
          {content}
        </a>
      )}
    </li>
  );
}
