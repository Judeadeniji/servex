import type { HTTPMethod } from "../../types";

export interface RouteConfig {
  /** Base directory to scan for routes */
  routesDir: string;
  /** File extensions to include */
  extensions?: string[];
  /** Whether to generate type definitions */
  generateTypes?: boolean;
  /** TypeScript configuration file path */
  tsConfigPath?: string;
  /** Development Mode */
  dev?: boolean;
}

export interface RouteDefinition {
  path: string;
  exports: {
    [key in [HTTPMethod][number]]?: unknown
  };
  filePath: string;
  sourceFile: string;
}

export interface RouteMatch {
  params: Record<string, string>;
  route: RouteDefinition;
}

export interface RoutePattern {
  regex: RegExp;
  paramNames: string[];
}
