import * as nodeHttp from "node:http";
import * as nodeHttps from "node:https";
import * as nodeHttp2 from "node:http2";

type Fetcher = (request: Request) => Promise<Response>;

export interface NodeServerOptions {
  tls?: boolean;
  tlsOptions?: nodeHttps.ServerOptions & nodeHttp2.SecureServerOptions;
  http2?: boolean;
}

function parseHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

const noBodyMethods = ["GET", "HEAD"];

class HttpRequest extends nodeHttp.IncomingMessage {}

function reqToRequest(
  req: HttpRequest | nodeHttp2.Http2ServerRequest,
  isHttp2: boolean
) {
  return new Promise<Request>((resolve, reject) => {
    if (isHttp2) {
      req = req as nodeHttp2.Http2ServerRequest;
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => {
        if (typeof chunk === "string") {
          chunks.push(Buffer.from(chunk));
        } else {
          chunks.push(chunk);
        }
      });

      req.on("error", (err) => {
        reject(err);
      });

      req.on("end", () => {
        const body = noBodyMethods.includes(req.method!)
          ? null
          : Buffer.concat(chunks);
        const url = new URL(
          req.url!,
          `${req.headers[":scheme"]}://${req.headers[":authority"]}`
        );
        const headers = new Headers();

        const reqHeaders = Object(req.headers);
        for (const key in reqHeaders) {
          if (key.startsWith(":")) continue;
          headers.append(key, reqHeaders[key]);
        }

        const request = new Request(url, {
          body,
          headers,
          method: req.headers[":method"] as string,
        });
        resolve(request);
      });
    } else {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => {
        chunks.push(chunk);
      });

      req.on("error", (err) => {
        reject(err);
      });

      req.on("end", () => {
        const body = noBodyMethods.includes(req.method!)
          ? null
          : Buffer.concat(chunks);
        const url = new URL(req.url!, `http://${req.headers.host}`);
        const request = new Request(url, {
          body,
          headers: req.headers as HeadersInit,
          method: req.method,
        });
        resolve(request);
      });
    }
  });
}

function requestHandler(fetcher: Fetcher, isHttp2: boolean = false) {
  return async (
    req: nodeHttp.IncomingMessage | nodeHttp2.Http2ServerRequest,
    res: nodeHttp.ServerResponse | nodeHttp2.Http2ServerResponse
  ) => {
    try {
      const request = await reqToRequest(req as HttpRequest, isHttp2);
      const response = await fetcher(request);
      if (isHttp2) {
        const headers: nodeHttp2.OutgoingHttpHeaders = {
          status: response.status,
          ...parseHeaders(response.headers),
        };
        delete headers['transfer-encoding'];  // Remove the 'transfer-encoding' header for HTTP/2
        res.writeHead(response.status, headers);
      } else {
        (res as nodeHttp.ServerResponse).writeHead(
          response.status,
          response.statusText,
          Object.entries(response.headers)
        );
      }

      if (response.body) {
        const writable = new WritableStream<Uint8Array>({
          write(chunk) {
            (res as nodeHttp2.Http2ServerResponse).write(chunk, console.error);
          },
          close() {
            res.end();
          },
        });
        response.body.pipeTo(writable);
      } else {
        res.end();
      }
    } catch (error) {
      console.error(error);
      if (isHttp2) {
        (res as nodeHttp2.Http2ServerResponse).writeHead(500, {
          status: 500,
        });
        (res as nodeHttp2.Http2ServerResponse).end("Internal Server Error");
      } else {
        (res as nodeHttp.ServerResponse).writeHead(
          500,
          "Internal Server Error"
        );
        (res as nodeHttp.ServerResponse).end("Internal Server Error");
      }
    }
  };
}

function createHttpsServer(
  fetcher: Fetcher,
  tlsOptions?: nodeHttps.ServerOptions & nodeHttp2.SecureServerOptions
) {
  return nodeHttps.createServer(
    {
      ...tlsOptions,
      joinDuplicateHeaders: true,
      IncomingMessage: HttpRequest,
    },
    requestHandler(fetcher)
  );
}

function createHttpServer(fetcher: Fetcher) {
  return nodeHttp.createServer(
    {
      joinDuplicateHeaders: true,
      IncomingMessage: HttpRequest,
    },
    requestHandler(fetcher)
  );
}

function createHttp2Server(
  fetcher: Fetcher,
  tlsOptions?: nodeHttp2.SecureServerOptions
) {
  return nodeHttp2.createSecureServer(
    {
      ...tlsOptions,
    },
    requestHandler(fetcher, true)
  );
}

function nodeServer(
  tls: boolean,
  http2: boolean,
  fetcher: Fetcher,
  tlsOptions?: nodeHttps.ServerOptions & nodeHttp2.SecureServerOptions
) {
  if (http2) {
    return createHttp2Server(fetcher, tlsOptions);
  } else if (tls) {
    return createHttpsServer(fetcher, tlsOptions);
  } else {
    return createHttpServer(fetcher);
  }
}

export function server(fetcher: Fetcher, options?: NodeServerOptions) {
  const defaultOptions: NodeServerOptions = {
    tls: false,
    http2: false,
  };

  options = { ...defaultOptions, ...options };

  const server = nodeServer(
    options.tls!,
    options.http2!,
    fetcher,
    options.tlsOptions
  );

  const listen = (...args: Parameters<typeof server.listen>) => {
    server.listen(...args);
  };

  const stop = (callback?: () => void) => {
    server.close((err) => {
      if (err) {
        console.error(err);
      }
      if (callback) callback();
    });
  };

  process.on("SIGTERM", () => stop(process.exit));
  process.on("SIGINT", () => stop(process.exit));

  return { listen, stop };
}
