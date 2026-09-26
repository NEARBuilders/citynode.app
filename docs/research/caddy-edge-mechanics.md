# Caddy edge mechanics: on-demand TLS, per-org wildcard DNS-01, ask endpoint

Research for [NEARBuilders/citynode.app#241](https://github.com/NEARBuilders/citynode.app/issues/241) (parent: #233). Investigated against primary sources only: caddyserver.com docs, Caddy source (`caddyserver/caddy`), letsencrypt.org docs, RFC 9525, and alchemy.run docs. Every claim carries its source URL. Date of research: 2026-09-26.

## TL;DR (recommended edge config shape)

1. **Per-org wildcards, issued proactively via DNS-01**, not on-demand. Caddy config: an automation policy with subject `*.chicago.citynode.app` and an ACME issuer configured with the Cloudflare DNS provider (`dns.providers.cloudflare`). DNS-01 requires exactly **one fixed TXT record** (`_acme-challenge.chicago.citynode.app`) per org zone — Caddy (libdns) creates and clears it automatically at issuance/renewal time.
2. **On-Demand TLS stays enabled but secondary**, with the `ask` endpoint as the abuse guard — it is for ad-hoc per-hostname fallback (HTTP-01), not the primary path, because LE caps new certificates at **50 per registered domain per 7 days**.
3. **One cert CAN carry `citynode.app` + `*.chicago.citynode.app` (+ more SANs)** — up to 100 identifiers per cert — but **per-zone certs are the safer default** (key blast radius, CT-log exposure, renewal coupling). `*.*.citynode.app` is **not issuable**: WebPKI/LE allow exactly one wildcard label, and it must be leftmost.
4. **Alchemy**: stock Cloudflare resources (`Zone`, `DNS.Record`, `Zone.Setting`) cover the infra provisioning. The challenge TXT record is Caddy's job at runtime. A **custom provider is not required** unless you decide to model the Caddy edge itself (cert/site lifecycle via Caddy's admin API) as an alchemy Resource.

Sources: [automatic-https](https://caddyserver.com/docs/automatic-https), [ondemand.go](https://github.com/caddyserver/caddy/blob/master/modules/caddytls/ondemand.go), [tlsapp.go](https://github.com/caddyserver/caddy/blob/master/caddyconfig/httpcaddyfile/tlsapp.go), [caddyfile options](https://caddyserver.com/docs/caddyfile/options), [caddy-dns/cloudflare](https://github.com/caddy-dns/cloudflare), [LE rate limits](https://letsencrypt.org/docs/rate-limits/), [LE challenge types](https://letsencrypt.org/docs/challenge-types/), [RFC 9525](https://www.ietf.org/rfc/rfc9525.pdf), [alchemy custom provider](https://alchemy.run/infrastructure-as-code/custom-provider), [alchemy Cloudflare domains](https://alchemy.run/cloudflare/networking/domains/).

---

## 1. Caddy On-Demand TLS: `ask` behavior, contract, rate-limit knobs

### What it is

When a TLS handshake arrives for an SNI Caddy has no certificate for, the handshake is **held** while Caddy obtains a certificate; only that first handshake is slow, subsequent ones are served from cache, and renewals happen in the background. Crucially, on-demand TLS does **not** require domains to be hard-coded in config, and **it never obtains wildcard certificates** — the Caddyfile adapter comment in `tlsapp.go` states: "OnDemand (currently) does not obtain wildcards … since the hostname is known at handshake". (Since Caddy 2.10, when a wildcard cert is automated for a policy, individual subdomains in config are served from that wildcard rather than getting their own certs.)

Sources: https://caddyserver.com/docs/automatic-https#on-demand-tls, https://github.com/caddyserver/caddy/blob/master/caddyconfig/httpcaddyfile/tlsapp.go, https://caddyserver.com/docs/automatic-https#wildcard-certificates

### The `ask` endpoint contract (module `tls.permission.http`)

Verified from Caddy source (`modules/caddytls/ondemand.go`):

- Config shape: `tls.automation.on_demand.permission` with module `http` and an `endpoint` URL. The older `"ask": "<url>"` JSON field / `ask` Caddyfile sub-option still works but is **deprecated** ("Use 'permission' instead with the `http` module") and errors if both are set.
- Behavior: Caddy issues an **HTTP GET** to `<endpoint>?domain=<requested-name>` — the `domain` query parameter is set to the SNI hostname (or IP). Existing query params on the endpoint are preserved (`qs.Set("domain", name)`).
- **Response contract:** any **2xx status = allowed**; anything else (including network error or non-2xx) = denied (`ErrPermissionDenied`). The **body is ignored** — permission is status-code-only. This means an oRPC route returning `204 No Content` works, but a JSON endpoint returning 200-with-error-body would wrongly allow; keep the endpoint thin.
- **Redirects are NOT followed** (explicitly rejected in the HTTP client), and the client has a **10-second timeout**. The endpoint "generally is not exposed publicly" (minor info leak: it reveals which domains the edge serves). The endpoint URL supports environment-variable replacer values.
- Permission may be consulted "as frequently as every TLS handshake" for a not-yet-loaded cert, so the ask backend should be fast and cheap (a DB lookup / rule check). Once the cert is loaded, it's cached in Caddy's cert cache and the ask endpoint is not re-hit for routine serving.
- There is also an `authoritative` permission module and community permission modules; `http` is the one shipped in the Caddy core binary.

Sources: https://github.com/caddyserver/caddy/blob/master/modules/caddytls/ondemand.go, https://caddyserver.com/docs/json/apps/tls/automation/on_demand/permission

### Caching and rate-limit semantics

- **Certificate cache:** first handshake triggers issuance; the cert is stored in Caddy's storage (certmagic) and reused; renewals are background maintenance. Failed asks are not positively cached (a denied host will re-ask on each handshake attempt for a cert).
- **Caddy internal rate limit:** 10 certificate-management attempts per ACME account per 10 seconds, independent of anything you configure — Caddy deliberately paces large batches (e.g., a million domains handed to it are obtained gradually).
- **The `interval`/`burst` on-demand rate-limit knobs are gone/deprecated.** The current Caddyfile global-options docs state explicitly: "⚠️ interval and burst rate limiting options were available, but are NOT recommended. Remove them from your config if you still have them." The modern `on_demand_tls` global option is:

  ```
  {
      on_demand_tls {
          ask <endpoint>
          permission <module> [<args...>]
      }
  }
  ```

  Abuse control is now expected to live in the **ask/permission backend** (application-level rules) — which is the right place for citynode anyway, since the ask endpoint will be backed by the platform's org/host DB.

- **Issuer fallback:** on issuance failure Caddy retries once, switches challenge type, then falls back across issuers (Let's Encrypt → ZeroSSL by default), then backs off exponentially (max 1 day between attempts, up to 30 days). During LE retries Caddy switches to LE's staging environment to spare production rate limits.

Sources: https://caddyserver.com/docs/caddyfile/options (search "on_demand_tls"), https://caddyserver.com/docs/automatic-https#errors

## 2. Wildcard DNS-01 issuance for `*.chicago.citynode.app`

### Which provider modules exist

Caddy's DNS provider modules live in the `caddy-dns/*` family (e.g., cloudflare, route53, digitalocean, gandi, googleclouddns, …) — see the module list at https://caddyserver.com/docs/modules and the wiki: https://caddy.community/t/how-to-use-dns-provider-modules-in-caddy-2/8148. For Cloudflare specifically the module is `dns.providers.cloudflare` ([caddy-dns/cloudflare](https://github.com/caddy-dns/cloudflare)), which wraps [libdns/cloudflare](https://github.com/libdns/cloudflare). Built via `xcaddy build --with github.com/caddy-dns/cloudflare` or the Caddy download page with the plugin selected.

Cloudflare auth (from the module README): a **single scoped API token** is recommended with `Zone.Zone:Read` + `Zone.DNS:Edit` for the zones being managed. Older zone-token + dns-token split is deprecated. Use env placeholders: `dns cloudflare {env.CF_API_TOKEN}`.

### Record placement for a one-level wildcard

For a wildcard `*.chicago.citynode.app`, the ACME **identifier is `chicago.citynode.app`** (the wildcard label is stripped for validation), so the DNS-01 challenge TXT record goes at **one fixed name**:

```
_acme-challenge.chicago.citynode.app  TXT  <token-derived value>
```

This is true no matter how many `userXYZ.chicago.citynode.app` hosts exist under the wildcard — issuance volume does not scale with user count. LE's docs: the client puts "that record at `_acme-challenge.<YOUR_DOMAIN>`"; multiple TXT records at the same name are legal (needed only when validating a wildcard and a non-wildcard name of the same zone simultaneously), and old records should be cleaned up (oversized TXT answers get rejected). CNAME/NS delegation of `_acme-challenge.*` to another zone is also supported (both by LE and Caddy's `tls` directive `dns_challenge_override_domain`).

Sources: https://letsencrypt.org/docs/challenge-types/#dns-01-challenge, https://caddyserver.com/docs/automatic-https#acme-challenges, https://caddyserver.com/docs/caddyfile/directives/tls#dns_challenge_override_domain

### Propagation knobs

Caddy's ACME issuer DNS challenge config exposes `propagation_delay`, `propagation_timeout`, `resolvers`, `ttl`, and `override_domain` (verified in `tlsapp.go` merge/clone functions and the caddy-dns/cloudflare troubleshooting section). If a resolver caches a pre-record answer, pin `resolvers 1.1.1.1`:

```
tls {
    dns cloudflare {env.CF_API_TOKEN}
    resolvers 1.1.1.1
}
```

Cloudflare's API is authoritative and near-instant, so with Cloudflare as both provider and resolver, propagation waits are typically seconds.

Sources: https://github.com/caddy-dns/cloudflare (troubleshooting), https://github.com/caddyserver/caddy/blob/master/caddyconfig/httpcaddyfile/tlsapp.go, https://caddyserver.com/docs/json/apps/tls/automation/policies/issuers/acme/challenges/dns/

### Long-lived wildcard renewal behavior

- Let's Encrypt certificates are 90 days; Caddy/certmagic renews automatically well before expiry and writes the cert/key to its storage. Renewals re-run DNS-01 (same fixed `_acme-challenge` name), so the Cloudflare token must stay valid across the cert's life.
- **ARI renewals are exempt from ALL LE rate limits** (see §4), so a long-lived wildcard costs effectively zero rate-limit budget. One wildcard per org ⇒ one renewal every ~60 days (Caddy default renewal window) ⇒ ~6 orders/year/org.

Sources: https://caddyserver.com/docs/automatic-https, https://letsencrypt.org/docs/rate-limits/#limit-exemptions-for-renewals

## 3. Multi-SAN vs per-zone certs; what wildcards are issuable at all

### One cert with `citynode.app` + `*.citynode.app` — YES

- A single Let's Encrypt certificate may include **up to 100 identifiers** (DNS names or wildcards), depending on profile. Putting the apex plus one or more wildcards in one cert is the canonical multi-tenant pattern (LE staff: "You need one certificate with two domain names `*.example.com` + `example.com`"). Each wildcard identifier in the order needs its **own DNS-01 validation** (its own `_acme-challenge.<zone-apex>` record — e.g., `_acme-challenge.chicago.citynode.app` for `*.chicago.citynode.app`).
- Rate-limit math is trivial for this shape: exact-set limit is 5 certs/7 days for the *same* identifier set, but renewals via **ARI are exempt from all rate limits**, and a 90-day cert renews ~4×/year.

Sources: https://letsencrypt.org/docs/rate-limits/ (New Orders per Account: "A single certificate can include up to 100 identifiers"), https://community.letsencrypt.org/t/wildcard-certificate-limit/86536, https://letsencrypt.org/docs/rate-limits/#limit-exemptions-for-renewals

### `*.*.citynode.app` — NOT issuable

- WebPKI rule (RFC 9525 / CA/Browser Forum BRs): a wildcard may occupy **only the complete left-most label**, and there may be **only one** wildcard character. Let's Encrypt's implementation strips "all wildcard labels from the left most portion" and allows DNS validation to cover a wildcard **at a single level** only. `*.*.citynode.app` and `foo*.example.com` are invalid as certificate subjects; Caddy likewise refuses them ("A site name qualifies for a wildcard if only its left-most domain label is a wildcard … `*.*.example.com` do[es] not [qualify]. This is a restriction of the WebPKI.").
- Practical consequence: per-org depth is one level. `*.chicago.citynode.app` covers `any.chicago.citynode.app` but NOT `a.b.chicago.citynode.app` — those need either a separate one-level wildcard (`*.b.chicago.citynode.app`, validated at `_acme-challenge.b.chicago.citynode.app`) or on-demand per-host certs.

Sources: https://www.ietf.org/rfc/rfc9525.pdf (§ wildcard: "There is only one wildcard character. The wildcard character appears only as the complete content of the left-most label."), https://caddyserver.com/docs/automatic-https#wildcard-certificates, https://community.letsencrypt.org/t/base-domain-validation/59009

### Multi-SAN vs per-zone: recommendation

| | One multi-SAN cert (apex + all org wildcards) | Per-org wildcard certs (per zone) |
|---|---|---|
| Issuance cost | 1 order covers all; all TXT records set in one order | N orders (one per org), still ~zero rate-limit impact via ARI |
| Key blast radius | One key vouches for every org — compromise hits all | Compromise contained to one org |
| CT logs | Every org's zone name appears in one CT cert (and all future renewals) | Same exposure, but scoped per cert |
| Renewal coupling | Reissuing for one org replaces the cert/key for all | Independent |
| On-chain/permission coupling | All-or-nothing per renewal if one org's DNS token lapses | One org failing validation doesn't block others |

**Recommendation: per-zone certs** (`citynode.app` apex on its own cert; `*.chicago.citynode.app` its own cert per org). The wildcard itself already shields individual user subdomains from CT-log enumeration, which is the main privacy win; the multi-SAN mega-cert only saves a handful of orders per year at real security/coupling cost. Caddy expresses this naturally as one automation policy per wildcard subject.

## 4. On-demand per-hostname HTTP-01 as fallback — and why it stays secondary

- On-demand issuance for a concrete hostname (e.g., `userXYZ.chicago.citynode.app`) uses HTTP-01/TLS-ALPN by default (ports 80/443, externally reachable) — no DNS module needed for the fallback path.
- **LE limit: up to 50 new certificates per registered domain per 7 days** (global across all accounts; refills 1 per 202 minutes). If user subdomains are provisioned on-demand rather than covered by the org wildcard, the 51st new tenant subdomain in a week fails issuance. The wildcard path has no such cliff (renewals only).
- Other current limits (LE rate-limits page, **last updated August 5, 2026** — current as of this research): 300 new orders/account/3h; 5 certificates per exact set of identifiers/7 days; 5 authorization failures per identifier/account/hour; ARI-based renewals exempt from **all** rate limits. (These reflect the 2024–2025 restructuring from the old "5 duplicate certs/week + 100 names/cert" scheme.)
- Caddy-side pacing: 10 management attempts/ACME account/10s internal limit; the ask endpoint must deny hosts the platform doesn't know or issuance budget gets burned by scanner SNI probes.

**Conclusion:** on-demand HTTP-01 is the safety net for ad-hoc hosts the wildcard can't cover (and for bootstrap before the wildcard exists), gated by the ask endpoint — but every steady-state host should be served from the per-org wildcard.

Sources: https://letsencrypt.org/docs/rate-limits/ (all figures), https://caddyserver.com/docs/automatic-https#acme-challenges, https://caddyserver.com/docs/automatic-https#errors

## 5. Does anything need an alchemy custom provider?

Framework context: alchemy providers are Effect Layers — a custom provider is a `Resource<Type, Props, Attributes>` + a `Provider.succeed(...)` layer with `reconcile`/`delete`/`list` (+ optional `diff`, `read`) lifecycle. ([alchemy.run/infrastructure-as-code/custom-provider](https://alchemy.run/infrastructure-as-code/custom-provider))

What the edge actually needs provisioned:

| Concern | Owner | Custom provider needed? |
|---|---|---|
| Cloudflare zone for `citynode.app` (and per-org zones, if delegating) | alchemy stock `Cloudflare.Zone.Zone` (with `adopt(true)` for the pre-existing apex) | No |
| Per-org user-subdomain DNS (A/CNAME or a wildcard record pointing at the edge) | alchemy stock `Cloudflare.DNS.Record` | No |
| Zone settings (e.g., `always_use_https`), DNSSEC | alchemy stock `Cloudflare.Zone.Setting`, `Cloudflare.DNS.Dnssec` | No |
| `_acme-challenge` TXT records at issuance/renewal | **Caddy/libdns at runtime** — created and cleared automatically; not declarative infra | No (must NOT be an alchemy resource — Caddy owns its lifecycle) |
| Org → wildcard host mapping that the ask endpoint queries | Platform app DB (oRPC route), not infra | No |
| Caddy itself (binary + plugin build, config push via admin API, cert storage backend) | Deployment target (Railway image / container) | **Only if** you want the Caddy edge modeled as code — e.g., a hypothetical `Caddy.Site`/`Caddy.Cert` resource that calls Caddy's admin API (`POST /config/...`) in `reconcile` with `diff`/`read` over the JSON config. That's a legitimate future custom provider, but nothing in the TLS mechanics forces it. |

Stock-resource references: https://alchemy.run/cloudflare/networking/domains/ (Zone/Record/Setting/Dnssec with adopt semantics and `(name, type)` identity), https://alchemy.run/infrastructure-as-code/custom-provider (custom provider = Effect Layer pattern).

**Answer: no custom provider is required.** The TLS issuance/renewal loop belongs to Caddy (certmagic + libdns); alchemy's role is provisioning DNS under the edge, which the stock Cloudflare resources cover — with the important caveat that alchemy's adoption gates (`adopt(true)`, `OwnedBySomeoneElse`) are exactly the right safety model for the pre-existing `citynode.app` zone. A Caddy-config-as-resource custom provider is a possible later hardening step, not a prerequisite.

## Edge config sketch (Caddyfile)

```
{
    on_demand_tls {
        ask http://127.0.0.1:3001/api/edge/tls-ask
    }
    email <acme-email>
}

# Per-org wildcard, issued proactively via DNS-01
*.chicago.citynode.app {
    tls {
        dns cloudflare {env.CF_API_TOKEN}
        resolvers 1.1.1.1
    }
    # reverse_proxy / routes ...
}

# On-demand fallback for ad-hoc hosts (ask-gated, HTTP-01/TLS-ALPN)
https:// {
    tls {
        on_demand
    }
    # ...
}
```

(Equivalent JSON uses `apps.tls.automation.policies[].subjects: ["*.chicago.citynode.app"]` with an `acme` issuer whose `challenges.dns.provider` is `{"name":"cloudflare","api_token":"{env.CF_API_TOKEN}"}`, plus `apps.tls.automation.on_demand.permission.http.endpoint` for the ask URL.)
