---
"everything-dev": patch
---

Security hardening: switch to Renovate, pin actions to SHAs, remove pull_request_target, scope secrets

- Replace Dependabot with Renovate (minimumReleaseAge 3 days general, 5 days @tanstack/*, minor bumps never automerged, helpers:pinGitHubActionDigests)
- Pin all GitHub Actions to commit SHAs to prevent tag-hijacking attacks
- Remove pull_request_target from preview.yml to prevent Pwn Request cache-poisoning
- Scope secrets to individual steps (not job-level env), remove id-token:write from job-level permissions
- Add dependency-review-action to CI for PRs
- Make bun audit fail on critical/high findings
- Document shared singleton trust model and supply chain incident response
