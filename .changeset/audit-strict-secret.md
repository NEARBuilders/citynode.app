---
"everything-dev": patch
---

Gate strict `bun audit` failure behind `AUDIT_STRICT` GitHub secret instead of a `workflow_dispatch` input. The audit step now fails CI on critical/high vulnerabilities when `AUDIT_STRICT=true` is set in repo secrets (works on all run types: push, PR, manual dispatch). Without the secret, it warns only — preserving the previous default behavior. Also fix a latent `set -e` bug: GitHub Actions' default shell aborts on non-zero exit codes, so `bun audit` returning 1 (vulnerabilities found) killed the script before the `AUDIT_STRICT` gate could run. Changed to `set +e -o pipefail` so the script captures the exit code and branches explicitly. Updated AGENTS.md, LLM.txt, and SECURITY.md to reflect Renovate (not Dependabot/dependency-review-action) as the active dependency vulnerability scanner, and removed stale references to `.npmrc` and axios `package.json` overrides that no longer exist.
