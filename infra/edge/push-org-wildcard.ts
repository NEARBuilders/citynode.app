const orgSlug = process.argv[2];
if (!orgSlug) {
  console.error("usage: bun push-org-wildcard.ts <org-slug>");
  process.exit(1);
}

const zone = process.env.EDGE_ZONE ?? "citynode.app";
const admin = process.env.CADDY_ADMIN ?? "http://localhost:2019";
const acmeCaUrl = process.env.ACME_CA_URL;

const issuer: Record<string, unknown> = {
  module: "acme",
  email: "{env.ACME_EMAIL}",
  challenges: {
    dns: {
      provider: { name: "cloudflare", api_token: "{env.CF_API_TOKEN}" },
      resolvers: ["1.1.1.1"],
    },
  },
};
if (acmeCaUrl) {
  issuer.ca = acmeCaUrl;
}

const policy = {
  subjects: [`*.${orgSlug}.${zone}`],
  issuers: [issuer],
};

const response = await fetch(`${admin}/config/apps/tls/automation/policies`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(policy),
});

const body = await response.text();
if (!response.ok) {
  console.error(`push failed (${response.status}): ${body}`);
  process.exit(1);
}
console.log(`appended automation policy for *.${orgSlug}.${zone}`);
console.log(body || "(no body)");
