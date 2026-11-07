export const NEAR_BUILDERS_BUILD_URL = "https://nearbuilders.org/build";

export function nearBuildersBuildUrl(referralCode?: string | null): string {
  const code = referralCode?.trim();
  if (!code) return NEAR_BUILDERS_BUILD_URL;
  const url = new URL(NEAR_BUILDERS_BUILD_URL);
  url.searchParams.set("ref", code);
  return url.toString();
}

type ReferralLookup = () => Promise<{ data: { code: string } | null; error: unknown }>;

export async function memberBuildUrl(lookup: ReferralLookup): Promise<string> {
  try {
    const { data } = await lookup();
    return nearBuildersBuildUrl(data?.code);
  } catch {
    return NEAR_BUILDERS_BUILD_URL;
  }
}
