/**
 * Async boundary — the ONLY thing the web entry may do synchronously is this
 * dynamic import: shared-scope negotiation must resolve before any shared
 * module executes (loadShareSync … eager:true crash class).
 *
 * BE CAREFUL MODIFYING THIS FILE — changes will be overwritten by `bos sync` / `bos upgrade`.
 * Prefer upstream changes at https://github.com/nearbuilders/everything-dev
 */

import "./styles.css";
import("./hydrate");
