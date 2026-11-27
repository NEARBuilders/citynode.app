---
"api": patch
---

Removing a community now keeps its event reports. Each report stays with the removed community's tenant, as monthly reports do, and the community's own reported events are kept as unlisted drafts. A reported place event is no longer offered to another community covering the place. Migration 0026 makes `event_reports.node_id` nullable and adds `removed_tenant_id`.
