import {
  ArrowLeftIcon,
  ArrowUpRightIcon,
  CheckIcon,
  CopyIcon,
  FileTextIcon,
  SparkleIcon,
  TerminalIcon,
} from "@phosphor-icons/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { getAppName } from "@/app";
import { EmptyState } from "@/components/empty-state";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { resolveAppLocale, translateAppMessage, useAppTranslation } from "@/i18n/runtime";
import { pageTitle } from "@/lib/page-title";

const INTENT_COMMAND = "npx @tanstack/intent@latest load everything-dev";

const INTENT_REGISTRY_URL = "https://tanstack.com/intent/registry/everything-dev";

export const Route = createFileRoute("/_public/skill")({
  loader: async ({ context }) => {
    const runtimeConfig = context.runtimeConfig;

    const skill = await fetch("/skill.md")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to load skill: ${response.status}`);
        }

        return response.text();
      })
      .catch(() => null);

    return {
      runtimeConfig,
      skill,
      intentRegistryUrl: INTENT_REGISTRY_URL,
    };
  },
  head: ({ match }) => ({
    meta: [
      {
        title: pageTitle(
          translateAppMessage(
            "about.skill",
            undefined,
            resolveAppLocale(undefined, match.context.locale),
          ),
          match.context.runtimeConfig,
        ),
      },
      {
        name: "description",
        content: translateAppMessage(
          "meta.skillDescription",
          undefined,
          resolveAppLocale(undefined, match.context.locale),
        ),
      },
    ],
  }),
  component: SkillPage,
});

function SkillPage() {
  const translate = useAppTranslation();
  const { skill, runtimeConfig, intentRegistryUrl } = Route.useLoaderData();
  const appName = getAppName(runtimeConfig);
  const [copied, setCopied] = useState<"prompt" | "command" | null>(null);

  const copy = async (kind: "prompt" | "command", text: string | null) => {
    if (!text) {
      toast.error(translate("skill.unavailable"));
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      toast.success(
        kind === "prompt" ? translate("skill.promptCopied") : translate("skill.commandCopied"),
      );
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error(translate("common.copyFallback"));
    }
  };

  return (
    <PageContainer variant="default">
      <Button
        variant="ghost"
        size="sm"
        className="-mb-6 self-start"
        nativeButton={false}
        render={<Link to="/about" data-testid="skill.back" />}
      >
        <ArrowLeftIcon />
        {translate("about.title")}
      </Button>
      <PageHeader
        headerTestId="skill.heading"
        icon={SparkleIcon}
        label={translate("common.docs")}
        title={translate("about.skill")}
        description={translate("skill.descriptionNamed", { name: appName ?? "" })}
        actions={
          <>
            <Button
              onClick={() => copy("prompt", skill)}
              disabled={!skill}
              data-testid="skill.copy"
            >
              {copied === "prompt" ? <CheckIcon /> : <CopyIcon />}
              {translate(copied === "prompt" ? "common.copied" : "skill.copyPrompt")}
            </Button>
            <Button
              variant="outline"
              nativeButton={false}
              render={(props) => (
                <a
                  {...props}
                  href="/skill.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="skill.raw-link"
                />
              )}
            >
              <FileTextIcon />
              skill.md
            </Button>
          </>
        }
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium text-foreground">{translate("skill.load")}</h2>
        <div className="flex items-center gap-3 rounded-2xl bg-muted py-2 pr-2 pl-4">
          <TerminalIcon className="size-5 shrink-0 text-muted-foreground" />
          <code className="min-w-0 flex-1 truncate font-mono text-sm text-foreground">
            {INTENT_COMMAND}
          </code>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={translate("skill.copyCommand")}
            onClick={() => copy("command", INTENT_COMMAND)}
          >
            {copied === "command" ? <CheckIcon /> : <CopyIcon />}
          </Button>
        </div>
        <Button
          variant="link"
          className="self-start"
          nativeButton={false}
          render={(props) => (
            <a {...props} href={intentRegistryUrl} target="_blank" rel="noopener noreferrer" />
          )}
        >
          {translate("skill.registry")}
          <ArrowUpRightIcon />
        </Button>
      </section>

      <section className="flex flex-col gap-6 border-t border-border pt-10">
        {skill ? (
          <Markdown content={skill} />
        ) : (
          <EmptyState
            icon={FileTextIcon}
            title={translate("skill.unavailable")}
            description={translate("skill.retry")}
          />
        )}
      </section>
    </PageContainer>
  );
}
