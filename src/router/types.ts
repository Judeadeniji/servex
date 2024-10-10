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

// Example usage
type Result = ExtractUrl<"/heroes/:heroName/:action?search=query&limit=10">;

// Additional test cases
type ResultNoQuery = ExtractUrl<"/heroes/:heroName/:action">;
type ResultEmptyQuery = ExtractUrl<"/heroes/:heroName/:action?">;
type ResultSingleParam = ExtractUrl<"/heroes/:heroName">;
type ResultSingleQuery = ExtractUrl<"/heroes/all?limit=10">;

// Uncomment to test
/*
type Test1 = Result extends {
  params: {
    heroName: string;
    action: string;
  };
  queries: {
    search: string;
    limit: string;
  };
} ? true : false; // should be true

type Test2 = ResultNoQuery extends {
  params: {
    heroName: string;
    action: string;
  };
  queries: {};
} ? true : false; // should be true

type Test3 = ResultSingleParam extends {
  params: {
    heroName: string;
  };
  queries: {};
} ? true : false; // should be true
*/

// Type to replace dynamic segments with `${string}` and prevent double slashes
type ReplaceDynamicSegments<T extends string[]> = 
  T extends [] 
    ? ""
    : T extends [infer F extends string, ...infer R extends string[]]
      ? F extends "" // Handle leading empty segments
        ? `/${ReplaceDynamicSegments<R>}` // Skip leading empty segments
        : F extends `:${infer Param}` // Dynamic segment
          ? `${string}${R extends [] ? "" : "/"}` // Replace with ${string} and handle trailing slash
          : F extends `*` // Wildcard segment
            ? `${string}${R extends [] ? "" : "/"}` // Replace with ${string} and handle trailing slash
            : `${F}${R extends [] ? "" : "/"}` | `${F}/${ReplaceDynamicSegments<R>}` // Normal segment
      : never;


export type DynamicSegmentsRemoved<Routes extends string> = ReplaceDynamicSegments<Split<Routes, "/">>;

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