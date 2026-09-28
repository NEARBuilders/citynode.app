import type { Messages } from "@lingui/core";

export const APP_LOCALES = ["en", "es", "fr", "zh"] as const;
export type AppLocale = (typeof APP_LOCALES)[number];
export const DEFAULT_APP_LOCALE: AppLocale = "en";
export const APP_LOCALE_COOKIE = "citynode_locale";

export const englishAppMessages = {
  "landing.eyebrow": "Local communities on NEAR",
  "landing.title": "Your city, on the network.",
  "landing.description":
    "Local communities that each run a NEAR validator. Find yours, meet the people, and stake to keep it online.",
  "landing.explore": "Explore communities",
  "landing.start": "Start a community",
  "landing.stats.communities": "Communities",
  "landing.stats.cities": "Cities",
  "landing.stats.regions": "States & countries",
  "landing.directory.title": "Communities",
  "landing.directory.description": "Events, local communities and staking pools.",
  "landing.directory.all": "See all",
  "landing.empty.title": "No communities yet",
  "landing.empty.description": "Be the first to put your city on the network.",
  "landing.steps.title": "How it works",
  "landing.steps.find.title": "Find your place",
  "landing.steps.find.body": "Pick a country, state or city from the directory.",
  "landing.steps.join.title": "Join the community",
  "landing.steps.join.body": "See who's organizing and show up to the next event.",
  "landing.steps.stake.title": "Stake NEAR",
  "landing.steps.stake.body": "Your stake keeps the local validator online and earns rewards.",
  "landing.cta.title": "No node in your city yet?",
  "landing.cta.description": "Your organization proposes it and the network reviews it.",
  "landing.cta.about": "About City Nodes",
} as const;

export type AppMessageId = keyof typeof englishAppMessages;
export type AppTranslator = (id: AppMessageId, values?: Record<string, string | number>) => string;

const spanishAppMessages = {
  "landing.eyebrow": "Comunidades locales en NEAR",
  "landing.title": "Tu ciudad, en la red.",
  "landing.description":
    "Comunidades locales que operan un validador de NEAR. Encuentra la tuya, conoce a las personas y delega para mantenerla en línea.",
  "landing.explore": "Explorar comunidades",
  "landing.start": "Crear una comunidad",
  "landing.stats.communities": "Comunidades",
  "landing.stats.cities": "Ciudades",
  "landing.stats.regions": "Estados y países",
  "landing.directory.title": "Comunidades",
  "landing.directory.description": "Eventos, comunidades locales y pools de staking.",
  "landing.directory.all": "Ver todas",
  "landing.empty.title": "Aún no hay comunidades",
  "landing.empty.description": "Sé la primera persona en poner tu ciudad en la red.",
  "landing.steps.title": "Cómo funciona",
  "landing.steps.find.title": "Encuentra tu lugar",
  "landing.steps.find.body": "Elige un país, estado o ciudad del directorio.",
  "landing.steps.join.title": "Únete a la comunidad",
  "landing.steps.join.body": "Descubre quién organiza y asiste al próximo evento.",
  "landing.steps.stake.title": "Delega NEAR",
  "landing.steps.stake.body":
    "Tu delegación mantiene el validador local en línea y genera recompensas.",
  "landing.cta.title": "¿Todavía no hay un nodo en tu ciudad?",
  "landing.cta.description": "Tu organización lo propone y la red lo revisa.",
  "landing.cta.about": "Acerca de City Nodes",
} satisfies Record<AppMessageId, string>;

const frenchAppMessages = {
  "landing.eyebrow": "Communautés locales sur NEAR",
  "landing.title": "Votre ville, sur le réseau.",
  "landing.description":
    "Des communautés locales qui exploitent chacune un validateur NEAR. Trouvez la vôtre, rencontrez ses membres et déléguez pour la maintenir en ligne.",
  "landing.explore": "Explorer les communautés",
  "landing.start": "Créer une communauté",
  "landing.stats.communities": "Communautés",
  "landing.stats.cities": "Villes",
  "landing.stats.regions": "États et pays",
  "landing.directory.title": "Communautés",
  "landing.directory.description": "Événements, communautés locales et pools de staking.",
  "landing.directory.all": "Tout voir",
  "landing.empty.title": "Aucune communauté pour le moment",
  "landing.empty.description": "Soyez la première personne à placer votre ville sur le réseau.",
  "landing.steps.title": "Comment ça marche",
  "landing.steps.find.title": "Trouvez votre place",
  "landing.steps.find.body": "Choisissez un pays, un État ou une ville dans l’annuaire.",
  "landing.steps.join.title": "Rejoignez la communauté",
  "landing.steps.join.body": "Découvrez les organisateurs et participez au prochain événement.",
  "landing.steps.stake.title": "Déléguez vos NEAR",
  "landing.steps.stake.body":
    "Votre délégation maintient le validateur local en ligne et génère des récompenses.",
  "landing.cta.title": "Pas encore de nœud dans votre ville ?",
  "landing.cta.description": "Votre organisation le propose et le réseau l’examine.",
  "landing.cta.about": "À propos de City Nodes",
} satisfies Record<AppMessageId, string>;

const chineseAppMessages = {
  "landing.eyebrow": "NEAR 上的本地社区",
  "landing.title": "让你的城市加入网络。",
  "landing.description":
    "每个本地社区都运行一个 NEAR 验证节点。找到你的社区、认识成员，并通过质押帮助节点保持在线。",
  "landing.explore": "探索社区",
  "landing.start": "创建社区",
  "landing.stats.communities": "社区",
  "landing.stats.cities": "城市",
  "landing.stats.regions": "州和国家",
  "landing.directory.title": "社区",
  "landing.directory.description": "活动、本地社区和质押池。",
  "landing.directory.all": "查看全部",
  "landing.empty.title": "暂无社区",
  "landing.empty.description": "成为第一个将你的城市加入网络的人。",
  "landing.steps.title": "运作方式",
  "landing.steps.find.title": "找到你的社区",
  "landing.steps.find.body": "从目录中选择国家、州或城市。",
  "landing.steps.join.title": "加入社区",
  "landing.steps.join.body": "了解组织者并参加下一场活动。",
  "landing.steps.stake.title": "质押 NEAR",
  "landing.steps.stake.body": "你的质押可帮助本地验证节点保持在线并获得奖励。",
  "landing.cta.title": "你的城市还没有节点？",
  "landing.cta.description": "由你的组织提出申请，网络会进行审核。",
  "landing.cta.about": "关于 City Nodes",
} satisfies Record<AppMessageId, string>;

const translatedMessages: Record<AppLocale, Partial<Record<AppMessageId, string>>> = {
  en: {},
  es: spanishAppMessages,
  fr: frenchAppMessages,
  zh: chineseAppMessages,
};

export function getAppMessages(locale: AppLocale): Messages {
  return { ...englishAppMessages, ...translatedMessages[locale] };
}
