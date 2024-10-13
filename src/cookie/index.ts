/**
 * This code was influenced by the `cookie` package.
 * See: https://github.com/jshttp/cookie
 */

export interface CookieParseOptions {
  decode?: (value: string) => string;
}

export interface CookieSerializeOptions {
    encode?: (value: string) => string;
    maxAge?: number;
    domain?: string;
    expires?: Date;
    httpOnly?: boolean;
    partitioned?: boolean;
    path?: string;
    sameSite?: boolean | "lax" | "strict" | "none";
    priority?: "Low" | "Medium" | "High";
    secure?: boolean;
}


function parse(string: string, options?: CookieParseOptions) {
  if (typeof string !== "string") {
    throw new TypeError("argument `string` must be a string");
  }

  const cookies: Record<string, string> = {};
  const strLen = string.length;

  if (strLen < 2) return cookies;

  const decodeFn = options?.decode || decode;
  let charIndex = 0,
    eqIdx = 0,
    endIdx = 0;

  while (charIndex < strLen) {
    eqIdx = string.indexOf("=", charIndex);
    if (eqIdx < 0) break;
    endIdx = string.indexOf(";", charIndex);

    if (endIdx < 0) endIdx = strLen;
    else if (endIdx > strLen) {
      charIndex = string.lastIndexOf(";", eqIdx - 1) + 1;
      continue;
    }

    const keyStartingIndex = startIndex(string, charIndex, eqIdx);
    const keyEndingIndex = endIndex(string, charIndex, keyStartingIndex);
    const key = string.slice(keyStartingIndex, keyEndingIndex);

    if (!Object.hasOwnProperty.call(cookies, key)) {
      let valueStartingIndex = startIndex(string, eqIdx + 1, endIdx);
      let valueEndingIndex = endIndex(string, eqIdx + 1, valueStartingIndex);

      if (
        string.charCodeAt(valueStartingIndex) === 0x22 &&
        string.charCodeAt(valueEndingIndex - 1) === 0x22
      ) {
        valueStartingIndex++;
        valueEndingIndex--;
      }

      const value = string.slice(valueStartingIndex, valueEndingIndex);
      cookies[key] = tryDecode(value, decodeFn);
    }

    charIndex = endIdx + 1;
  }
}

function startIndex(string: string, start: number, end: number) {
  while (start < end && string.charCodeAt(start) === 0x20) {
    start++;
  }
  return start;
}

function endIndex(string: string, start: number, end: number) {
  while (end > start && string.charCodeAt(end - 1) === 0x20) {
    end--;
  }
  return end;
}

function serialize(name: string, value: string, options?: CookieSerializeOptions) {
    const encodeFn = options?.encode || encodeURIComponent;
    
    if (typeof encodeFn !== "function") {
        throw new TypeError("option `encode` must be a function");
    }

    if (!isCookieNameValid(name)) {
        throw new TypeError("argument `name` is invalid");
    }

    const _value = encodeFn(value);

    if (!isCookieValueValid(_value)) {
        throw new TypeError("argument `value` is invalid");
    }

    let cookieString = `${name}=${_value}`;
    if (!options) return cookieString;

    if (options.maxAge) {
        const maxAge = Math.floor(options.maxAge);

        if (!isFinite(maxAge)) {
            throw new TypeError("option `maxAge` is invalid");
        }

        cookieString += `; Max-Age=${maxAge}`;
    }

    if (options.domain) {
        if (!isDomainValid(options.domain)) {
            throw new TypeError("option `domain` is invalid");
        }

        cookieString += `; Domain=${options.domain}`;
    }

    if (options.expires) {
        if (!(options.expires instanceof Date)) {
            throw new TypeError("option `expires` is invalid");
        }

        cookieString += `; Expires=${options.expires.toUTCString()}`;
    }

    if (options.httpOnly) {
        cookieString += "; HttpOnly";
    }

    if (options.partitioned) {
        cookieString += "; Partitioned";
    }

    if (options.path) {
        if (!isPathValid(options.path)) {
            throw new TypeError("option `path` is invalid");
        }

        cookieString += `; Path=${options.path}`;
    }

    if (options.sameSite) {
        switch (options.sameSite) {
            case true:
                cookieString += "; SameSite";
                break;
            case "lax":
                cookieString += "; SameSite=Lax";
                break;
            case "strict":
                cookieString += "; SameSite=Strict";
                break;
            case "none":
                cookieString += "; SameSite=None";
                break;
            default:
                throw new TypeError("option `sameSite` is invalid");
        }
    }

    if (options.priority) {
        switch (options.priority) {
            case "Low":
                cookieString += "; Priority=Low";
                break;
            case "Medium":
                cookieString += "; Priority=Medium";
                break;
            case "High":
                cookieString += "; Priority=High";
                break;
            default:
                throw new TypeError("option `priority` is invalid");
        }
    }

    if (options.secure) {
        cookieString += "; Secure";
    }

    return cookieString;
}

function isCookieNameValid(name: string) {
    return /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name)
}

function isCookieValueValid(value: string) {
    return /^("?)[\u0021\u0023-\u002B\u002D-\u003A\u003C-\u005B\u005D-\u007E]*\1$/.test(value);
}

function isDomainValid(domain: string) {
    return /^([.]?[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)([.][a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i.test(domain);
}

function isPathValid(path: string) {
    return /^[\u0020-\u003A\u003D-\u007E]*$/.test(path);
}

function decode(value: string) {
  return value.indexOf("%") !== -1 ? decodeURIComponent(value) : value;
}

function tryDecode(value: string, decodeFn: (value: string) => string) {
  try {
    return decodeFn(value);
  } catch {
    return value;
  }
}

export {
    parse,
    serialize
}