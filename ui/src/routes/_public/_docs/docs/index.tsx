import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  BookOpenIcon,
  CoinsIcon,
  GraduationCapIcon,
  HammerIcon,
  MapPinIcon,
  PlantIcon,
  PlusCircleIcon,
  QrCodeIcon,
} from "@phosphor-icons/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { ComponentType } from "react";
import { getAppName } from "@/app";
import { Button, PageContainer, PageHeader } from "@/components";
import type { AppMessageId } from "@/i18n/catalogs";
import { resolveAppLocale, translateAppMessage, useAppTranslation } from "@/i18n/runtime";
import { pageTitle } from "@/lib/page-title";

export const Route = createFileRoute("/_public/_docs/docs/")({
  loader: ({ context }) => ({ runtimeConfig: context.runtimeConfig }),
  head: ({ match }) => ({
    meta: [
      {
        title: pageTitle(
          translateAppMessage(
            "meta.docs",
            undefined,
            resolveAppLocale(undefined, match.context.locale),
          ),
          match.context.runtimeConfig,
        ),
      },
      {
        name: "description",
        content: translateAppMessage(
          "meta.docsDescription",
          undefined,
          resolveAppLocale(undefined, match.context.locale),
        ),
      },
    ],
  }),
  component: DocsOverview,
});

type SectionLink =
  | { to: "/explore" | "/stake" | "/apply" | "/docs/build"; label: AppMessageId }
  | { href: string; label: AppMessageId }
  | { href: string; text: string };

const SECTIONS: {
  slug: string;
  icon: ComponentType<{ className?: string }>;
  title: AppMessageId;
  body: AppMessageId[];
  links: SectionLink[];
}[] = [
  {
    slug: "what",
    icon: MapPinIcon,
    title: "about.what.title",
    body: ["about.what.body", "about.what.places"],
    links: [
      { to: "/explore", label: "landing.explore" },
      { href: "https://www.near.org/blog/legion-city-nodes", label: "about.announcement" },
    ],
  },
  {
    slug: "join",
    icon: QrCodeIcon,
    title: "about.join.title",
    body: ["about.join.body", "about.join.members"],
    links: [],
  },
  {
    slug: "stake",
    icon: CoinsIcon,
    title: "about.stake.title",
    body: ["about.stake.body", "about.stake.rewards"],
    links: [
      { to: "/stake", label: "stake.action" },
      { href: "https://trezu.org", text: "trezu.org" },
    ],
  },
  {
    slug: "start",
    icon: PlusCircleIcon,
    title: "about.start.title",
    body: ["about.start.body"],
    links: [{ to: "/apply", label: "landing.start" }],
  },
];

const PATHS: {
  slug: string;
  icon: ComponentType<{ className?: string }>;
  title: AppMessageId;
  body: AppMessageId;
  links: SectionLink[];
}[] = [
  {
    slug: "learn",
    icon: GraduationCapIcon,
    title: "about.paths.learn.title",
    body: "about.paths.learn.body",
    links: [{ to: "/explore", label: "landing.explore" }],
  },
  {
    slug: "build",
    icon: HammerIcon,
    title: "about.paths.build.title",
    body: "about.paths.build.body",
    links: [
      { href: "https://nearbuilders.org", text: "nearbuilders.org" },
      { to: "/docs/build", label: "docs.nav.builders" },
    ],
  },
  {
    slug: "grow",
    icon: PlantIcon,
    title: "about.paths.grow.title",
    body: "about.paths.grow.body",
    links: [{ to: "/apply", label: "landing.start" }],
  },
];

function DocsOverview() {
  const translate = useAppTranslation();
  const { runtimeConfig } = Route.useLoaderData();
  const appName = getAppName(runtimeConfig);

  return (
    <PageContainer variant="default">
      <PageHeader
        headerTestId="docs.heading"
        icon={BookOpenIcon}
        label={translate("docs.nav.start")}
        title={translate("common.aboutTitle", { name: appName ?? "" })}
        description={translate("about.description")}
      />

      <div className="flex flex-col gap-10">
        {SECTIONS.map((section) => (
          <section
            key={section.slug}
            className="flex flex-col gap-3"
            data-testid={`about.section-${section.slug}`}
          >
            <h2 className="flex items-center gap-3 text-xl font-semibold text-foreground">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <section.icon className="size-5" />
              </span>
              {translate(section.title)}
            </h2>
            {section.body.map((paragraph) => (
              <p key={paragraph} className="max-w-2xl text-base text-muted-foreground">
                {translate(paragraph)}
              </p>
            ))}
            {section.links.length > 0 && (
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {section.links.map((link) => (
                  <SectionLinkButton key={"to" in link ? link.to : link.href} link={link} />
                ))}
              </div>
            )}
          </section>
        ))}
      </div>

      <section className="flex flex-col gap-4" data-testid="about.paths">
        <h2 className="text-xl font-semibold text-foreground">{translate("about.paths.title")}</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {PATHS.map((path) => (
            <div
              key={path.slug}
              className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5"
              data-testid={`about.path-${path.slug}`}
            >
              <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <path.icon className="size-5" />
              </span>
              <div className="flex flex-col gap-1">
                <h3 className="font-semibold text-foreground">{translate(path.title)}</h3>
                <p className="text-sm text-muted-foreground">{translate(path.body)}</p>
              </div>
              <div className="mt-auto flex flex-col items-start gap-1">
                {path.links.map((link) => (
                  <SectionLinkButton key={"to" in link ? link.to : link.href} link={link} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </PageContainer>
  );
}

function SectionLinkButton({ link }: { link: SectionLink }) {
  const translate = useAppTranslation();
  return "to" in link ? (
    <Button
      variant="link"
      className="h-auto p-0"
      nativeButton={false}
      render={<Link to={link.to} />}
    >
      {translate(link.label)}
      <ArrowRightIcon />
    </Button>
  ) : (
    <Button
      variant="link"
      className="h-auto p-0"
      nativeButton={false}
      render={(props) => (
        <a {...props} href={link.href} target="_blank" rel="noopener noreferrer" />
      )}
    >
      {"label" in link ? translate(link.label) : link.text}
      <ArrowUpRightIcon />
    </Button>
  );
}
