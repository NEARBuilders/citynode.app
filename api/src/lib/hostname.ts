export const RESERVED_GATEWAY_LABELS: ReadonlySet<string> = new Set([
  "www",
  "admin",
  "api",
  "auth",
  "login",
  "docs",
  "staging",
]);

const LABEL_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, "");
}

export function isValidHostname(hostname: string): boolean {
  return (
    hostname.length > 0 &&
    hostname.length <= 253 &&
    hostname.split(".").every((label) => LABEL_REGEX.test(label))
  );
}

export function isReservedGatewayHostname(hostname: string, gatewayDomains: string[]): boolean {
  if (!hostname.includes(".")) return RESERVED_GATEWAY_LABELS.has(hostname);
  return gatewayDomains.some((domain) => {
    if (hostname === domain) return true;
    if (!hostname.endsWith(`.${domain}`)) return false;
    return hostname
      .slice(0, -(domain.length + 1))
      .split(".")
      .some((label) => RESERVED_GATEWAY_LABELS.has(label));
  });
}
