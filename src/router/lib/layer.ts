import type { Context } from "../../context";
import type { Env } from "../../types";
import type Route from "./route";

type RoutePartType = 'static' | 'dynamic' | 'optional' | 'wildcard' | 'catchAll' | 'namedWildcard';

type RoutePart = {
  type: RoutePartType;
  value?: string;
  paramName?: string;
  optional?: boolean;
};

type MatchResult = {
  matched: boolean;
  params?: Record<string, string>;
};

export default class Layer<E extends Env> {
  path: string;
  options: Record<string, unknown>;
  handle: Function;
  route?: Route<E>;
  sensitive: boolean;
  strict: boolean;
  end: boolean;
  parts: RoutePart[];

  constructor(path: string, options: Record<string, unknown>, fn: Function) {
    this.path = path;
    this.options = options;
    this.handle = fn;
    this.sensitive = !!options.sensitive;
    this.strict = !!options.strict;
    this.end = !!options.end;
    this.parts = this.parsePath(path);
  }

  private isOptionalSegment(segment: string): boolean {
    return segment.endsWith('?') && !segment.endsWith('\\?');
  }

  private isNamedWildcard(segment: string): boolean {
    return segment.startsWith('*') && segment.length > 1;
  }

  private stripOptionalChar(segment: string): string {
    return segment.endsWith('?') ? segment.slice(0, -1) : segment;
  }

  private parseParamName(segment: string): string {
    if (segment.startsWith(':')) return segment.slice(1);
    if (segment.startsWith('*')) return segment.slice(1);
    return segment;
  }

  private parsePath(path: string): RoutePart[] {
    // Handle empty path
    if (!path || path === '/') {
      return [{ type: 'static', value: '' }];
    }

    // Split path and filter out empty segments
    const segments = path.split('/')
      .filter(segment => segment.length > 0);
    
    const parts: RoutePart[] = [];
    let hasOptionalSegment = false;

    for (let i = 0; i < segments.length; i++) {
      let segment = segments[i];
      const isOptional = this.isOptionalSegment(segment);
      
      // Strip the optional character if present
      if (isOptional) {
        segment = this.stripOptionalChar(segment);
        hasOptionalSegment = true;
      } else if (hasOptionalSegment) {
        // If we've seen an optional segment, all following segments must be optional
        throw new Error('Non-optional segment cannot follow an optional segment');
      }

      if (segment === '**') {
        parts.push({ 
          type: 'catchAll',
          optional: isOptional
        });
      } else if (this.isNamedWildcard(segment)) {
        parts.push({
          type: 'namedWildcard',
          paramName: this.parseParamName(segment),
          optional: isOptional
        });
      } else if (segment === '*') {
        parts.push({ 
          type: 'wildcard',
          optional: isOptional
        });
      } else if (segment.startsWith(':')) {
        parts.push({
          type: 'dynamic',
          paramName: this.parseParamName(segment),
          value: segment,
          optional: isOptional
        });
      } else {
        parts.push({
          type: 'static',
          value: segment,
          optional: isOptional
        });
      }
    }

    return parts;
  }

  match(path: string): MatchResult {
    // Handle empty path
    if (!path || path === '/') {
      return {
        matched: this.parts.length === 0 || 
                (this.parts.length === 1 && 
                 this.parts[0].type === 'static' && 
                 this.parts[0].value === ''),
        params: {}
      };
    }

    // Normalize path based on case sensitivity
    const normalizedPath = this.sensitive ? path : path.toLowerCase();
    
    // Split and filter out empty segments
    const segments = normalizedPath.split('/')
      .filter(segment => segment.length > 0);

    const params: Record<string, string> = {};
    let partIndex = 0;
    let segmentIndex = 0;

    while (partIndex < this.parts.length) {
      const part = this.parts[partIndex];
      const segment = segments[segmentIndex];

      // Handle missing segment for optional parts
      if (!segment && part.optional) {
        partIndex++;
        continue;
      }

      // Handle required segment missing
      if (!segment && !part.optional) {
        return { matched: false };
      }

      switch (part.type) {
        case 'static': {
          const partValue = this.sensitive ? part.value : part.value?.toLowerCase();
          if (segment !== partValue) {
            if (part.optional) {
              partIndex++;
              continue;
            }
            return { matched: false };
          }
          partIndex++;
          segmentIndex++;
          break;
        }

        case 'dynamic': {
          if (segment) {
            if (part.paramName) {
              params[part.paramName] = decodeURIComponent(segment);
            }
            partIndex++;
            segmentIndex++;
          } else if (part.optional) {
            partIndex++;
          } else {
            return { matched: false };
          }
          break;
        }

        case 'namedWildcard':
        case 'catchAll': {
          // Collect all remaining segments
          const remaining = segments.slice(segmentIndex).join('/');
          if (remaining || !part.optional) {
            if (part.paramName) {
              params[part.paramName] = decodeURIComponent(remaining);
            }
            return { matched: true, params };
          }
          partIndex++;
          break;
        }

        case 'wildcard': {
          if (segment || !part.optional) {
            segmentIndex++;
          }
          partIndex++;
          break;
        }

        case 'optional': {
          if (segment === part.value) {
            segmentIndex++;
          }
          partIndex++;
          break;
        }

        default:
          return { matched: false };
      }
    }

    // Check if we've matched all segments when strict mode is enabled
    if (this.strict && segmentIndex !== segments.length) {
      return { matched: false };
    }

    // In non-strict mode, we're good if we've consumed all parts
    return {
      matched: true,
      params: Object.keys(params).length > 0 ? params : undefined
    };
  }

  async handleRequest(c: Context<E>, next: Function): Promise<Response> {
    try {
        console.log(this.handle)
      return await this.handle(c, next);
    } catch (err) {
      return this.handleError(err);
    }
  }

  handleError(err: Error | unknown): Response {
    console.error('Router error:', err);
    return new Response('Internal Server Error', { status: 500 });
  }
}