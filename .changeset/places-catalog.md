---
"api": patch
---

Places catalog: a seeded, read-only gazetteer of canonical places (countries + first-level subdivisions from GeoNames/Natural Earth, curated supranationals like CIS) with slug-based public identifiers and geonames/ISO alias lookups. New public read routes (`/places/resolve`, `/places/roots`, `/places/{id}`, `/places/{id}/children`, `/places/{id}/boundary`) expose place identity plus community status (node link, activation time, member count). Nodes gain nullable `place_id`, `org_id`, `activated_at`, `activated_by` association columns (backfill lands with the next ticket).
