export const FEATURE_AREAS = ["node-operations", "finance", "stake", "events"] as const;

export type FeatureArea = (typeof FEATURE_AREAS)[number];

export const FEATURE_AREA_MESSAGES: Record<FeatureArea, AppMessageId> = {
  "node-operations": "feature.nodeOperations",
  finance: "feature.finance",
  stake: "nav.stake",
  events: "feature.events",
};

export function isFeatureArea(value: string): value is FeatureArea {
  return (FEATURE_AREAS as readonly string[]).includes(value);
}

import type { AppMessageId } from "@/i18n/catalogs";
