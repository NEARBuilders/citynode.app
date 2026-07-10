---
"api": patch
---

feat(api): typed middleware context narrowing with Zod org metadata parsing

- Added `parseOrgMetadata` helper that validates org metadata via an
  optional Zod schema at runtime, falling back to `Record<string, unknown>`
  when no schema is provided. Throws `INTERNAL_SERVER_ERROR` on parse
  failure (data integrity).
- Added `UserMiddleware`, `OrgMiddleware`, `MemberMiddleware`,
  `ApiKeyMiddleware` type aliases so all middleware casts are
  self-documenting and dry.
- Derived `OrgAuthenticatedContext<TMeta>` and
  `OrgMemberAuthenticatedContext<TMeta>` from generated
  `AuthOrganizationContext`/`AuthOrganizationSummary` — only
  `activeOrganizationId`, `metadata`, and `member` are manually
  narrowed; everything else (including future auth plugin fields)
  flows from the generated types automatically.
- All middlewares now properly type-narrow context through `.use()`.
  `userId`/`user` are `string`/`RequestAuthUser` (non-null) after
  `requireAuth`; `activeOrganizationId` is `string` after
  `requireOrganization`; `apiKey` is `ApiKeyContext` after
  `requireApiKey`.
- Removed `requireUser` (was identical to `requireAuth`).
- Fixed `requireAuthOrApiKey` to pass the full context through (was
  passing `{}`, misleadingly suggesting context was cleared).
- Fixed latent bug: `.use(requireAuthOrApiKey())` → `.use(requireAuthOrApiKey)`.
- Removed stale `context.userId!` non-null assertions throughout
  route handlers.
