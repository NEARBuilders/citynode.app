import type { AppMessageId, AppTranslator } from "@/i18n/catalogs";
import { translateEnglishAppMessage } from "@/i18n/runtime";
import type { RemotePath } from "@/lib/runtime-map.gen";

/** Sub-sections the auth plugin publishes under /settings (generated inventory). */
type RemoteSettingsSection = RemotePath extends `/settings/${infer Section}` ? Section : never;

export interface Crumb {
  label: string;
  to?: string;
}

export interface CrumbContext {
  appName?: string;
  orgName?: (slug: string) => string | undefined;
  guideTitle?: (slug: string) => string | undefined;
  detailName?: string;
  tab?: string;
}

function humanize(segment: string) {
  const text = decodeURIComponent(segment).replace(/[-_]+/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function page(label: string): Crumb {
  return { label };
}

const PLATFORM_SECTIONS = new Set(["tenants", "relayer", "system"]);

export function crumbsFor(
  pathname: string,
  context: CrumbContext = {},
  t: AppTranslator = translateEnglishAppMessage,
): Crumb[] {
  const SETTINGS_SECTIONS = {
    profile: t("nav.profile"),
    "auth-methods": t("nav.signinMethods"),
    "api-keys": t("nav.apiKeys"),
    security: t("nav.security"),
  } satisfies Partial<Record<RemoteSettingsSection, string>>;

  const ADMIN_SECTIONS: Record<
    string,
    { label: string; detail: string; edit: AppMessageId; create?: AppMessageId }
  > = {
    nodes: {
      label: t("common.communities"),
      detail: t("nav.community"),
      edit: "nav.editCommunity",
      create: "nav.newCommunity",
    },
    proposals: {
      label: t("common.proposals"),
      detail: t("nav.proposal"),
      edit: "nav.editProposal",
      create: "nav.newProposal",
    },
    tenants: {
      label: t("nav.sites"),
      detail: t("nav.site"),
      edit: "nav.editSite",
    },
    relayer: {
      label: t("nav.relayer"),
      detail: t("nav.relayer"),
      edit: "nav.editRelayer",
      create: "nav.newRelayer",
    },
    system: {
      label: t("nav.system"),
      detail: t("nav.system"),
      edit: "nav.editSystem",
      create: "nav.newSystem",
    },
  };

  const HOME: Crumb = { label: t("common.home"), to: "/dashboard" };
  const MY_COMMUNITY: Crumb = { label: t("nav.myCommunity"), to: "/dashboard/node" };
  const EXPLORE: Crumb = { label: t("nav.explore"), to: "/explore" };
  const ORGS: Crumb = { label: t("nav.organizations"), to: "/orgs" };
  const ADMIN: Crumb = { label: t("nav.admin") };
  const PLATFORM: Crumb = { label: t("common.platform") };
  const SETTINGS: Crumb = { label: t("nav.settings"), to: "/settings" };
  const DOCS: Crumb = { label: t("nav.docs"), to: "/docs" };
  const REPORTS: Crumb = { label: t("reports.title"), to: "/report" };

  const segments = pathname.split("/").filter(Boolean);
  const [first, second, third, fourth, fifth] = segments;

  if (segments.length === 0) return [page(context.appName ?? "CityNode")];

  switch (first) {
    case "dashboard":
      if (second !== "node") return [page(HOME.label)];
      if (third === "proposals") {
        if (!fourth) return [MY_COMMUNITY, page(t("common.proposals"))];
        return [
          MY_COMMUNITY,
          { label: t("common.proposals"), to: "/dashboard/node/proposals" },
          page(t("nav.proposal")),
        ];
      }
      return [page(MY_COMMUNITY.label)];
    case "report":
      return [page(REPORTS.label)];
    case "nodes":
      if (third === "reports") return [REPORTS, page(t("reports.monthlyHeading"))];
      if (third === "events" && fifth === "report") return [REPORTS, page(t("report.title"))];
      if (third === "events" && second) {
        const events = { label: t("events.title"), to: `/nodes/${second}/content` };
        if (fourth === "new") return [MY_COMMUNITY, events, page(t("nav.newEvent"))];
        if (fifth === "edit") return [MY_COMMUNITY, events, page(t("nav.editEvent"))];
      }
      return [
        MY_COMMUNITY,
        page(context.tab === "onboarding" ? t("nav.onboarding") : t("events.title")),
      ];
    case "tenant":
      return [MY_COMMUNITY, page(t("nav.communitySettings"))];
    case "explore":
      return [page(EXPLORE.label)];
    case "n":
      return second ? [EXPLORE, page(humanize(second))] : [page(EXPLORE.label)];
    case "activity":
      return [EXPLORE, page(t("events.event"))];
    case "stake":
      return [page(t("common.stake"))];
    case "apply":
      return [page(t("dashboard.startCommunity"))];
    case "discover":
      return [ADMIN, page(t("nav.directory"))];
    case "me":
      return [page(t("nav.activity"))];
    case "orgs": {
      if (!second) return [MY_COMMUNITY, page(ORGS.label)];
      if (second === "new") return [MY_COMMUNITY, ORGS, page(t("nav.newOrganization"))];
      if (second === "invites") return [MY_COMMUNITY, ORGS, page(t("nav.invitation"))];
      return [MY_COMMUNITY, ORGS, page(context.orgName?.(second) ?? decodeURIComponent(second))];
    }
    case "admin": {
      if (second === "stations") return [ADMIN, PLATFORM, page(t("org.stations"))];
      if (second === "events") return [ADMIN, page(t("events.title"))];
      if (second === "reports") return [ADMIN, page(t("reports.title"))];
      const section = second ? ADMIN_SECTIONS[second] : undefined;
      if (!section) return [page(ADMIN.label)];
      const parents = PLATFORM_SECTIONS.has(second ?? "") ? [ADMIN, PLATFORM] : [ADMIN];
      if (!third) return [...parents, page(section.label)];
      const sectionCrumb = { label: section.label, to: `/admin/${second}` };
      if (fourth === "edit")
        return [
          ...parents,
          sectionCrumb,
          { label: context.detailName ?? section.detail, to: `/admin/${second}/${third}` },
          page(t(section.edit)),
        ];
      return [
        ...parents,
        sectionCrumb,
        page(
          third === "new" && section.create
            ? t(section.create)
            : (context.detailName ?? section.detail),
        ),
      ];
    }
    case "settings": {
      const section = second ? SETTINGS_SECTIONS[second as RemoteSettingsSection] : undefined;
      return section ? [SETTINGS, page(section)] : [page(SETTINGS.label)];
    }
    case "docs": {
      if (!second) return [page(DOCS.label)];
      if (second === "build") return [DOCS, page(t("docs.nav.builders"))];
      return [DOCS, page(context.guideTitle?.(second) ?? humanize(second))];
    }
    case "skill":
      return [DOCS, { label: t("docs.nav.builders"), to: "/docs/build" }, page(t("docs.skill"))];
    case "login":
      return [page(t("nav.signIn"))];
    case "onboard":
      return [page(t("nav.join"))];
    case "onboarding":
      return [page(t("nav.onboardingStation"))];
    default:
      if (segments.length === 1) return [page(decodeURIComponent(first))];
      return segments.map((segment) => page(humanize(segment)));
  }
}
