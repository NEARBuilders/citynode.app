---
"ui": patch
"api": patch
"@everything-dev/proposals-plugin": patch
---

Explore now lists every active community. Communities that haven't set up an Explore profile show as a basic card with their name and a link to their page, so the count matches the home page; a community whose profile was unpublished stays hidden. The apply form starts as a city and offers "No country (standalone city)", so a city can be applied for without a country above it; a state still needs a country. Stake now flags communities with no validator yet, lists the ones you can stake to first, and the no-validator page links to Explore. `listStakeCommunities` returns a `stakeable` flag.
