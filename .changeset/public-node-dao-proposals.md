---
"ui": patch
"api": patch
---

Anyone can read a community's Node DAO proposals at `/n/<slug>/proposals`, with each proposal's status, proposer, kind, votes and description at `/n/<slug>/proposals/<id>`. The community page links there when the community has a Node DAO. The DAO comes from the new public `getNodeDao` procedure, which reads the community's tenant owner live and returns nothing for communities owned by a person or the platform. Reading the DAO, the proposal list, an older page or a single proposal each fail with a retry instead of an empty list. Testnet DAOs aren't shown yet.
