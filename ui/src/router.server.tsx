import { RootNotFound } from "./components/root-not-found";
import { RouterError, RouterPending } from "./components/router-error";
/**
 * SSR router — thin stub injecting the app's generated route tree into the
 * framework SSR router module (MF `./Router` expose, node entry).
 *
 * BE CAREFUL MODIFYING THIS FILE — changes will be overwritten by `bos sync` / `bos upgrade`.
 * Prefer upstream changes at https://github.com/nearbuilders/everything-dev
 */

import { createServerRouterModule } from "everything-dev/ui/router-server";
import { APP_LOCALE_COOKIE, APP_LOCALES, DEFAULT_APP_LOCALE } from "./i18n/catalogs";
import { routeTree } from "./routeTree.gen";

const routerModule = createServerRouterModule({
  defaultRouteTree: routeTree,
  defaultErrorComponent: RouterError,
  defaultPendingComponent: RouterPending,
  defaultNotFoundComponent: RootNotFound,
  locale: {
    locales: APP_LOCALES,
    defaultLocale: DEFAULT_APP_LOCALE,
    cookieName: APP_LOCALE_COOKIE,
  },
});

export default routerModule;
