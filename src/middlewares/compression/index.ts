import type { Context, MiddlewareHandler, NextFunction } from "../../types";

export interface CompressionOptions {
  /**
   * Minimum response size in bytes to apply compression.
   * Note: This only works if the Content-Length header is present on the original response.
   * @default 1024
   */
  threshold?: number;
}

export function compression<C extends Context>(options: CompressionOptions = {}): MiddlewareHandler<C> {
  const threshold = options.threshold ?? 1024;

  return async (c: C, next: NextFunction) => {
    const res = await next();
    
    // If there is no response (e.g. 404 fallback will happen later), we skip
    if (!res?.body) return res;

    // Skip if already compressed
    if (res.headers.has("Content-Encoding")) return res;

    // Check threshold if Content-Length is present
    const contentLength = res.headers.get("Content-Length");
    if (contentLength && parseInt(contentLength, 10) < threshold) {
      return res;
    }

    const acceptEncoding = c.req.headers.get("Accept-Encoding");
    if (!acceptEncoding) return res;

    let encoding: "gzip" | "deflate" | null = null;
    if (acceptEncoding.includes("gzip")) {
      encoding = "gzip";
    } else if (acceptEncoding.includes("deflate")) {
      encoding = "deflate";
    }

    if (!encoding) return res;

    // Create compression stream
    const compressionStream = new CompressionStream(encoding);
    const compressedBody = res.body.pipeThrough(compressionStream);

    const vary = res.headers.get("Vary");
    c.setHeaders({
      "Content-Encoding": encoding,
      "Vary": !vary ? "Accept-Encoding" : (vary.includes("Accept-Encoding") ? vary : `${vary}, Accept-Encoding`)
    });

    // Delete Content-Length from context headers just in case
    c.header.delete("Content-Length");

    // We must merge the original response headers with our context headers 
    // to support both c.json() and raw new Response() returns safely.
    const finalHeaders = new Headers(res.headers);
    for (const [k, v] of c.header.entries()) {
      finalHeaders.set(k, v);
    }
    finalHeaders.delete("Content-Length");

    return new Response(compressedBody, {
      status: res.status,
      statusText: res.statusText,
      headers: finalHeaders,
    }); 
  }
}
