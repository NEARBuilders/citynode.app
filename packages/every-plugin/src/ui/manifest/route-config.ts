/**
 * routeConfig.gen.ts contract — the generated import map (ADR 0008 §2).
 *
 * The generator emits one module per ui source exposing a loader per route
 * record: a dynamic import of that route's file, destructured to the option
 * bundle construction needs. Options and component live in the same route
 * file (standard authoring), so both arrive via the same per-route chunk.
 * The host consumes this module — source-resolved from disk in dev,
 * MF-exposed (`./routeConfig`) in production.
 */

import type { ReactNode } from "react";

export interface RouteHeadData {
  meta?: Array<Record<string, unknown>>;
  links?: Array<Record<string, unknown>>;
  scripts?: Array<Record<string, unknown>>;
}

export interface RouteOptionsBundle {
  loader?: (...args: Array<any>) => any;
  beforeLoad?: (...args: Array<any>) => any;
  head?: (...args: Array<any>) => RouteHeadData;
  staticData?: Record<string, unknown>;
  component?: (props: any) => ReactNode;
  errorComponent?: (props: any) => ReactNode;
  pendingComponent?: (props: any) => ReactNode;
  notFoundComponent?: (props: any) => ReactNode;
}

export type RouteConfigRef = () => Promise<RouteOptionsBundle>;

export type RouteConfigModule = {
  routeConfigLoaders: Record<string, RouteConfigRef>;
  /** Lifted `__root` meta, when the source declares it. */
  rootMeta?: RouteOptionsBundle;
};
