# UI hygiene on current main

Issue #215's hydration, session, navigation and router code moved to
`packages/everything-dev/src/ui`. Auth uses that shared session implementation;
the old plugin-local bootstrap WeakSet no longer exists.

Device approval and API key components already use semantic tokens. Auth has
already migrated from Radix to Base UI, so neither individual Radix packages nor
the Radix meta-package remain in its dependencies.

The UI script variants remain required:

- `dev:built`: `packages/everything-dev/src/service-descriptor.ts` selects it for
  `BOS_NO_WATCH=1`.
- `build:client` and `build:ssr`: `scripts/regression/container-build.ts` invokes
  both to build regression images.

Organization lists now share `organizationsQueryOptions`. The public homepage
CTA previously shared the key while using a different fetcher that converted
failed responses to an empty successful result. Session fetch failures now
remain errors instead of becoming cached signed-out sessions. The sidebar
exposes loading, failure and retry states, and mounted lists revalidate cached
data without discarding the previous successful result.

## Validation

- UI suite: 70 files, 456 tests passed.
- Shared framework UI suite: 12 files, 114 tests passed, including hydration
  recovery and transient session failure cases.
- Workspace typecheck: all nine configured workspaces passed.
- Root lint and the final UI build passed.
- Frozen dependency installation passed with the required Bun 1.4.2.

The complete root test run exhausted the available memory during API tests.
Single-worker API runs also stalled, including the Postgres-backed attempt.
The organization browser regressions cover repeated reloads and failed-list
recovery and passed in CI. A complete local Docker image with isolated Postgres
databases reported ready API, auth, and SSR services. After Meteor Wallet sign-in
in the in-app browser, the active organization and its member remained visible
after three reloads and a cache-bypassing reload. The organization list and
switcher also retained membership after reload. The PR screenshot shows the
authenticated organization after refresh.
