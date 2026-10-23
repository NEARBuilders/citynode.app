---
"api": patch
"@everything-dev/proposals-plugin": patch
"ui": patch
---

Stop using the deprecated rpc.mainnet.near.org / rpc.testnet.near.org endpoints. DAO policy checks now go to FastNEAR with drpc as a fallback (override with `NEAR_RPC_URLS_MAINNET` / `NEAR_RPC_URLS_TESTNET`), pick testnet for `.testnet` DAOs, time out each request after 4s and retry with backoff. When NEAR can't be reached the api returns a 503 that the UI shows as "Couldn't reach NEAR, try again" instead of reporting the account as not a sputnik-dao contract.
