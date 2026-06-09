---
"everything-dev": patch
---

Fix: Skip init typecheck tests in CI and run tests before version bump in release workflow

The `init.typecheck.test.ts` and `init.full.test.ts` tests run `bun install` which
requires npm packages. When the release workflow runs after a version bump but before
publish, the bumped versions don't exist on npm yet, causing the tests to fail.

- Skip `init.typecheck.test.ts` and `init.full.test.ts` in CI (`process.env.CI === "true"`)
- Move the `Test everything-dev release` step in `.github/workflows/release.yml` to run
  **before** the `changesets/action` step (version bump), so tests run on the current
  published versions rather than unpublished bumped versions.
