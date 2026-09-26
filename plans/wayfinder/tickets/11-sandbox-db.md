## Question

Which database engine do sandbox tenants use, given the tiered tenant model (workshop vs production) and the alchemy provisioning direction?

## Resolution

**RESOLVED — tiered engines.**

- Workshop tier: embedded PGlite (tens of MB on top of the ~300–500MB app process floor; acceptable inside a sandbox container).
- Production tier: Neon, provisioned via alchemy (`Drizzle.Schema` as an alchemy resource, migrations applied at deploy — never runtime), completing `../infra/toml-infra-alchemy.md` Phase 4 (map decision 16).
- Sovereign tenants provision their own databases with their own alchemy program.

Execution of the production tier is tracked in `plans/infra/toml-infra-alchemy.md` Phase 4 and `advisor-plans/031-resource-provisioner-seam.md`.
