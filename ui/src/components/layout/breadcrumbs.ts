import type { AppMessageId, AppTranslator } from "@/i18n/catalogs";
import { translateEnglishAppMessage } from "@/i18n/runtime";
export interface Crumb {
  label: string;
  to?: string;
}

export interface CrumbContext {
  appName?: string;
  orgName?: (slug: string) => string | undefined;
  tab?: string;
}

function humanize(segment: string) {
  const text = decodeURIComponent(segment).replace(/[-_]+/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function page(label: string): Crumb {
  return { label };
}

export function crumbsFor(
  pathname: string,
  context: CrumbContext = {},
  t: AppTranslator = translateEnglishAppMessage,
): Crumb[] {
  const SETTINGS_SECTIONS: Record<string, string> = {
    profile: t("nav.profile"),
    "auth-methods": t("nav.signinMethods"),
    "api-keys": t("nav.apiKeys"),
    security: t("nav.security"),
  };

  const ADMIN_SECTIONS: Record<
    string,
    { label: string; detail: string; edit: AppMessageId; create: AppMessageId }
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
      create: "nav.newSite",
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
  const THINGS: Crumb = { label: t("nav.things"), to: "/things" };
  const ADMIN: Crumb = { label: t("nav.admin"), to: "/admin" };
  const SETTINGS: Crumb = { label: t("nav.settings"), to: "/settings" };
  const DOCS: Crumb = { label: t("nav.docs"), to: "/about" };

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
    case "nodes":
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
    case "build":
      return [page(t("nav.build"))];
    case "discover":
      return [page(t("nav.directory"))];
    case "orgs": {
      if (!second) return [page(ORGS.label)];
      if (second === "new") return [ORGS, page(t("nav.newOrganization"))];
      if (second === "invites") return [ORGS, page(t("nav.invitation"))];
      return [ORGS, page(context.orgName?.(second) ?? decodeURIComponent(second))];
    }
    case "things": {
      if (!second) return [page(THINGS.label)];
      if (second === "new") return [THINGS, page(t("nav.newThing"))];
      if (second === "live") return [THINGS, page(t("nav.live"))];
      return [THINGS, page(t("nav.thing"))];
    }
    case "admin": {
      if (second === "organizations") return [ADMIN, page(ORGS.label)];
      const section = second ? ADMIN_SECTIONS[second] : undefined;
      if (!section) return [page(ADMIN.label)];
      if (!third) return [ADMIN, page(section.label)];
      const sectionCrumb = { label: section.label, to: `/admin/${second}` };
      if (fourth === "edit")
        return [
          ADMIN,
          sectionCrumb,
          { label: section.detail, to: `/admin/${second}/${third}` },
          page(t(section.edit)),
        ];
      return [ADMIN, sectionCrumb, page(third === "new" ? t(section.create) : section.detail)];
    }
    case "settings": {
      const section = second ? SETTINGS_SECTIONS[second] : undefined;
      return section ? [SETTINGS, page(section)] : [page(SETTINGS.label)];
    }
    case "about":
      return [page(DOCS.label)];
    case "skill":
      return [DOCS, page(t("about.skill"))];
    case "prototype-staking-poc":
      return [page(t("tenant.lifecycle"))];
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
