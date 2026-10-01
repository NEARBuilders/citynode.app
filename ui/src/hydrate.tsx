/**
 * Client bootstrap — thin stub wiring the app's generated core route config
 * into the framework hydrator (MF `./Hydrate` expose).
 *
 * BE CAREFUL MODIFYING THIS FILE — changes will be overwritten by `bos sync` / `bos upgrade`.
 * Prefer upstream changes at https://github.com/nearbuilders/everything-dev
 */

import "./styles.css";
import { hydrate as coreHydrate } from "everything-dev/ui/hydrate";
import { RootNotFound } from "./components/root-not-found";
import { RouterError, RouterPending } from "./components/router-error";

export function hydrate() {
  return coreHydrate({
    routeConfig: () => import("./routeConfig.gen"),
    defaultErrorComponent: RouterError,
    defaultPendingComponent: RouterPending,
    defaultNotFoundComponent: RootNotFound,
  });
}

export default hydrate;
