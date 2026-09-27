import * as Alchemy from "alchemy";
import * as AdoptPolicy from "alchemy/AdoptPolicy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Output from "alchemy/Output";
import * as Effect from "effect/Effect";

const zoneName = process.env.EDGE_ZONE ?? "citynode.app";
const edgeIpv4 = process.env.EDGE_IPV4;

if (!edgeIpv4) {
  throw new Error("EDGE_IPV4 is required — the edge machine's dedicated public IP");
}

export default Alchemy.Stack(
  "CityNodeEdge",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const { accountId } = yield* Cloudflare.CloudflareEnvironment;

    const zone = yield* Cloudflare.Zone.Zone("EdgeZone", {
      name: zoneName,
    }).pipe(AdoptPolicy.adopt(true));

    yield* Cloudflare.DNS.Dnssec("EdgeDnssec", {
      zoneId: zone.zoneId,
    });

    const apex = yield* Cloudflare.DNS.Record("EdgeApex", {
      zoneId: zone.zoneId,
      name: "@",
      type: "A",
      content: edgeIpv4,
      proxied: false,
    }).pipe(AdoptPolicy.adopt(true));

    const wildcard = yield* Cloudflare.DNS.Record("EdgeWildcard", {
      zoneId: zone.zoneId,
      name: "*",
      type: "A",
      content: edgeIpv4,
      proxied: false,
    }).pipe(AdoptPolicy.adopt(true));

    const dnsToken = yield* Cloudflare.ApiToken.AccountApiToken("EdgeDns", {
      name: `edge-dns-${zoneName}`,
      accountId,
      policies: Output.map(zone.zoneId, (zoneId) => [
        {
          effect: "allow" as const,
          permissionGroups: ["Zone Read", "DNS Write"],
          resources: {
            [`com.cloudflare.api.account.zone.${zoneId}`]: "*",
          },
        },
      ]),
    });

    return {
      zoneName,
      zoneId: zone.zoneId,
      nameservers: zone.nameServers,
      apexRecord: apex.name,
      wildcardRecord: wildcard.name,
      edgeIpv4,
      dnsTokenValue: dnsToken.value,
    };
  }),
);
