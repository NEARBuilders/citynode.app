import { getSocialImageMeta } from "everything-dev/ui/metadata";
import type { ClientRuntimeConfig } from "@/app";
import { getAppName } from "@/app";

export function socialMeta({
  title,
  description,
  path,
  runtimeConfig,
  type,
}: {
  title: string;
  description: string;
  path: string;
  runtimeConfig?: Partial<ClientRuntimeConfig> | null;
  type?: string;
}) {
  const hostUrl = (runtimeConfig?.hostUrl ?? "").replace(/\/$/, "");
  return getSocialImageMeta({
    imageUrl: hostUrl ? `${hostUrl}/metadata.png` : "/metadata.png",
    title,
    description,
    siteName: getAppName(runtimeConfig ?? undefined) || "CityNode",
    siteUrl: hostUrl ? `${hostUrl}${path}` : "",
    type,
    alt: description,
  });
}
