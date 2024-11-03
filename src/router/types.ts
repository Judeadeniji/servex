import type { Env, Handler } from "../types";

export type UnionToTuple<U, T extends any[] = []> = 
    [U] extends [never] ? T : 
    UnionToTuple<Exclude<U, U>, [...T, U]>;


export type Split<
  S extends string,
  D extends string
> = S extends `${infer T}${D}${infer U}` ? [T, ...Split<U, D>] : [S];

export type Coerce<T> = T extends Function
  ? T
  : T extends object
  ? { [K in keyof T]: Coerce<T[K]> }
  : T;


// Get path part of URL
type GetPath<T extends string> = T extends `${infer Path}?${string}`
  ? Path
  : T;

// Get query part of URL
type GetQuery<T extends string> = T extends `${string}?${infer Query}`
  ? Query
  : "";

// Extract path parameters
type PathParams<Path extends string> = Path extends `${string}:${infer Param}/${infer Rest}`
  ? { [K in Param]: string } & PathParams<Rest>
  : Path extends `${string}:${infer Param}`
    ? { [K in Param]: string }
    : {};

// Extract query parameters
type QueryParams<Query extends string> = Query extends `${infer Param}=${string}${infer Rest}`
  ? { [K in Param]: string } & (Rest extends `&${infer Next}`
    ? QueryParams<Next>
    : {})
  : {};

// Main type to extract both path and query parameters
export type ExtractUrl<T extends string> = Coerce<{
  params: PathParams<GetPath<T>>;
  queries: QueryParams<GetQuery<T>>;
}>;


type ExtractSegments<T extends string> = Split<GetPath<T>, "/">;

type MatchSegment<Route extends string, Actual extends string> = 
  Route extends `:${string}` ? true :
  Route extends Actual ? true :
  false;

type MatchPath<
  RouteParts extends string[],
  ActualParts extends string[],
> = RouteParts extends [infer RouteFirst extends string, ...infer RouteRest extends string[]]
  ? ActualParts extends [infer ActualFirst extends string, ...infer ActualRest extends string[]]
    ? MatchSegment<RouteFirst, ActualFirst> extends true
      ? MatchPath<RouteRest, ActualRest>
      : false
    : false
  : RouteParts["length"] extends ActualParts["length"]
    ? true
    : false;

type MatchQuery<RouteQuery extends string, ActualQuery extends string> =
  QueryParams<RouteQuery> extends QueryParams<ActualQuery>
    ? QueryParams<ActualQuery> extends QueryParams<RouteQuery>
      ? true
      : false
    : false;

// Main route matching type
export type RouteMatch<Route extends string, Actual extends string> =
  MatchPath<ExtractSegments<Route>, ExtractSegments<Actual>> extends true
    ? GetQuery<Route> extends ""
      ? GetQuery<Actual> extends ""
        ? true
        : false
      : MatchQuery<GetQuery<Route>, GetQuery<Actual>>
    : false;

// Helper type to ensure the paths are correctly formatted
type TrimSlash<T extends string> = T extends `/${infer U}` ? U : T;

// Main type to merge two paths
export type MergePaths<P1 extends string, P2 extends string> = 
  P1 extends `${infer R1}/`
    ? P2 extends `/${infer R2}`
      ? `/${R1}/${R2}`
      : `/${R1}/${TrimSlash<P2>}`
    : P2 extends `/${infer R2}`
      ? `/${TrimSlash<P1>}/${R2}`
      : `/${TrimSlash<P1>}/${TrimSlash<P2>}`;

      /**
 * @module
 * This module provides types definitions and variables for the routers.
 */

/**
 * Constant representing all HTTP methods in uppercase.
 */
export const METHOD_NAME_ALL = 'ALL' as const
/**
 * Constant representing all HTTP methods in lowercase.
 */
export const METHOD_NAME_ALL_LOWERCASE = 'all' as const
/**
 * Array of supported HTTP methods.
 */
export const METHODS = ['get', 'post', 'put', 'delete', 'options', 'patch', 'trace', 'connect', 'head'] as const
/**
 * Error message indicating that a route cannot be added because the matcher is already built.
 */
export const MESSAGE_MATCHER_IS_ALREADY_BUILT =
  'Can not add a route since the matcher is already built.'

/**
 * Interface representing a router.
 *
 * @template T - The type of the handler.
 */
export interface Router<T> {
  /**
   * The name of the router.
   */
  name: string

  /**
   * Adds a route to the router.
   *
   * @param method - The HTTP method (e.g., 'get', 'post').
   * @param path - The path for the route.
   * @param handler - The handler for the route.
   */
  add(method: string, path: string, handler: T): void

  /**
   * Matches a route based on the given method and path.
   *
   * @param method - The HTTP method (e.g., 'get', 'post').
   * @param path - The path to match.
   * @returns The result of the match.
   */
  match(method: string, path: string): Result<T>
}

/**
 * Type representing a map of parameter indices.
 */
export type ParamIndexMap = Record<string, number>
/**
 * Type representing a stash of parameters.
 */
export type ParamStash = string[]
/**
 * Type representing a map of parameters.
 */
export type Params = Record<string, string>
/**
 * Type representing the result of a route match.
 *
 * The result can be in one of two formats:
 * 1. An array of handlers with their corresponding parameter index maps, followed by a parameter stash.
 * 2. An array of handlers with their corresponding parameter maps.
 *
 * Example:
 *
 * [[handler, paramIndexMap][], paramArray]
 * ```typescript
 * [
 *   [
 *     [middlewareA, {}],                     // '*'
 *     [funcA,       {'id': 0}],              // '/user/:id/*'
 *     [funcB,       {'id': 0, 'action': 1}], // '/user/:id/:action'
 *   ],
 *   ['123', 'abc']
 * ]
 * ```
 *
 * [[handler, params][]]
 * ```typescript
 * [
 *   [
 *     [middlewareA, {}],                             // '*'
 *     [funcA,       {'id': '123'}],                  // '/user/:id/*'
 *     [funcB,       {'id': '123', 'action': 'abc'}], // '/user/:id/:action'
 *   ]
 * ]
 * ```
 */
export type Result<T> = [[T, ParamIndexMap][], ParamStash] | [[T, Params][]]

/**
 * Error class representing an unsupported path error.
 */
export class UnsupportedPathError extends Error {}


export interface RouterRoute<E extends Env> {
  path: string
  method: string
  handler: Handler<E>
}

export type RouteHandlerPair<E extends Env> = [Handler<E>, RouterRoute<E>];