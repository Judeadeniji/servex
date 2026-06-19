import { describe, it, expect } from "bun:test";
import { createServer } from "../src/index";
import {
  HttpException,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  MethodNotAllowedError,
  ConflictError,
  ValidationError,
  TooManyRequestsError,
  InternalServerError,
  ServiceUnavailableError,
  isHttpException,
} from "../src/errors";

// ─── Unit: HttpException ──────────────────────────────────────────────────────

describe("HttpException", () => {
  it("creates an instance with correct properties", () => {
    const ex = new HttpException({ statusCode: 404, message: "Not here" });
    expect(ex.statusCode).toBe(404);
    expect(ex.message).toBe("Not here");
    expect(ex.error).toBe("Not Found");
    expect(ex).toBeInstanceOf(Error);
    expect(ex).toBeInstanceOf(HttpException);
  });

  it("uses a custom error label when provided", () => {
    const ex = new HttpException({ statusCode: 400, error: "CustomLabel", message: "bad" });
    expect(ex.error).toBe("CustomLabel");
  });

  it("getBody() returns correct shape without data", () => {
    const ex = new HttpException({ statusCode: 401, message: "Unauthorized" });
    const body = ex.getBody();
    expect(body).toEqual({ statusCode: 401, error: "Unauthorized", message: "Unauthorized" });
    expect("data" in body).toBe(false);
  });

  it("getBody() includes data when provided", () => {
    const ex = new HttpException({ statusCode: 422, data: { field: "email" } });
    const body = ex.getBody();
    expect(body.data).toEqual({ field: "email" });
  });

  it("getResponse() returns a Response with correct status and JSON body", async () => {
    const ex = new HttpException({ statusCode: 403, message: "Forbidden" });
    const res = ex.getResponse();
    expect(res.status).toBe(403);
    expect(res.headers.get("content-type")).toContain("application/json");
    const json = await res.json() as any;
    expect(json.statusCode).toBe(403);
    expect(json.message).toBe("Forbidden");
  });

  it("getResponse() merges custom headers", async () => {
    const ex = new HttpException({
      statusCode: 401,
      headers: { "WWW-Authenticate": "Bearer" },
    });
    const res = ex.getResponse();
    expect(res.headers.get("WWW-Authenticate")).toBe("Bearer");
  });

  it("supports cause chaining", () => {
    const cause = new Error("original");
    const ex = new HttpException({ statusCode: 500, cause });
    expect((ex as any).cause).toBe(cause);
  });

  describe("static factories", () => {
    it("HttpException.badRequest() → 400", () => {
      expect(HttpException.badRequest("bad").statusCode).toBe(400);
    });
    it("HttpException.notFound() → 404", () => {
      expect(HttpException.notFound().statusCode).toBe(404);
    });
    it("HttpException.internalServerError() → 500", () => {
      expect(HttpException.internalServerError().statusCode).toBe(500);
    });
    it("HttpException.tooManyRequests() → 429", () => {
      expect(HttpException.tooManyRequests().statusCode).toBe(429);
    });
  });
});

// ─── Unit: Named error classes ────────────────────────────────────────────────

describe("Named error classes", () => {
  it("BadRequestError → 400 + correct name", () => {
    const e = new BadRequestError("missing field");
    expect(e.statusCode).toBe(400);
    expect(e.name).toBe("BadRequestError");
    expect(e).toBeInstanceOf(HttpException);
    expect(e).toBeInstanceOf(BadRequestError);
  });

  it("UnauthorizedError → 401", () => {
    expect(new UnauthorizedError().statusCode).toBe(401);
  });

  it("ForbiddenError → 403", () => {
    expect(new ForbiddenError().statusCode).toBe(403);
  });

  it("NotFoundError → 404", () => {
    const e = new NotFoundError("item not found");
    expect(e.statusCode).toBe(404);
    expect(e.message).toBe("item not found");
  });

  it("MethodNotAllowedError → 405 with Allow header", () => {
    const e = new MethodNotAllowedError(["GET", "POST"]);
    expect(e.statusCode).toBe(405);
    const res = e.getResponse();
    expect(res.headers.get("Allow")).toBe("GET, POST");
  });

  it("ConflictError → 409", () => {
    expect(new ConflictError().statusCode).toBe(409);
  });

  it("ValidationError → 422 with field data", () => {
    const e = new ValidationError("Validation failed", {
      data: { fields: { email: "must be valid" } },
    });
    expect(e.statusCode).toBe(422);
    expect((e.data as any).fields.email).toBe("must be valid");
  });

  it("TooManyRequestsError → 429 with Retry-After header", () => {
    const e = new TooManyRequestsError(60);
    expect(e.statusCode).toBe(429);
    const res = e.getResponse();
    expect(res.headers.get("Retry-After")).toBe("60");
  });

  it("InternalServerError → 500", () => {
    expect(new InternalServerError().statusCode).toBe(500);
  });

  it("ServiceUnavailableError → 503", () => {
    expect(new ServiceUnavailableError().statusCode).toBe(503);
  });
});

// ─── Unit: isHttpException guard ─────────────────────────────────────────────

describe("isHttpException()", () => {
  it("returns true for HttpException instances", () => {
    expect(isHttpException(new HttpException({ statusCode: 400 }))).toBe(true);
  });

  it("returns true for named subclasses", () => {
    expect(isHttpException(new NotFoundError())).toBe(true);
    expect(isHttpException(new ValidationError())).toBe(true);
  });

  it("returns false for plain Error", () => {
    expect(isHttpException(new Error("nope"))).toBe(false);
  });

  it("returns false for non-error values", () => {
    expect(isHttpException(null)).toBe(false);
    expect(isHttpException("string")).toBe(false);
    expect(isHttpException(42)).toBe(false);
  });
});

// ─── Integration: errors thrown inside handlers ───────────────────────────────

describe("HttpException integration — thrown in handlers", () => {
  it("HttpException thrown in fast path returns correct JSON response", async () => {
    const app = createServer();
    app.get("/protected", () => {
      throw new ForbiddenError("Access denied");
    });

    const res = await app.fetch(new Request("http://localhost/protected"));
    expect(res.status).toBe(403);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json() as any;
    expect(body.statusCode).toBe(403);
    expect(body.error).toBe("Forbidden");
    expect(body.message).toBe("Access denied");
  });

  it("HttpException thrown in slow path (with hooks) returns correct JSON response", async () => {
    const app = createServer();
    app.onRequest(() => {}); // force slow path
    app.get("/notfound", () => {
      throw new NotFoundError("Resource missing");
    });

    const res = await app.fetch(new Request("http://localhost/notfound"));
    expect(res.status).toBe(404);
    const body = await res.json() as any;
    expect(body.statusCode).toBe(404);
    expect(body.message).toBe("Resource missing");
  });

  it("plain Error thrown in handler returns 500 JSON", async () => {
    const app = createServer();
    app.get("/boom", () => {
      throw new Error("Unexpected failure");
    });

    const res = await app.fetch(new Request("http://localhost/boom"));
    expect(res.status).toBe(500);
    const body = await res.json() as any;
    expect(body.statusCode).toBe(500);
    expect(body.error).toBe("Internal Server Error");
  });

  it("async handler throwing HttpException is caught properly", async () => {
    const app = createServer();
    app.get("/async-err", async () => {
      await Promise.resolve();
      throw new UnauthorizedError("Token expired");
    });

    const res = await app.fetch(new Request("http://localhost/async-err"));
    expect(res.status).toBe(401);
    const body = await res.json() as any;
    expect(body.error).toBe("Unauthorized");
  });

  it("ValidationError includes data field in response body", async () => {
    const app = createServer();
    app.post("/register", () => {
      throw new ValidationError("Validation failed", {
        data: { fields: { username: "required" } },
      });
    });

    const res = await app.fetch(new Request("http://localhost/register", { method: "POST" }));
    expect(res.status).toBe(422);
    const body = await res.json() as any;
    expect(body.data.fields.username).toBe("required");
  });
});

// ─── Integration: onError hook receives HttpException ────────────────────────

describe("onError hook with HttpException", () => {
  it("onError hook receives the HttpException and can override response", async () => {
    const app = createServer();
    app.onError((err, c) => {
      if (isHttpException(err)) {
        return c.json({ custom: true, code: err.statusCode }, err.statusCode as any);
      }
    });

    app.get("/fail", () => {
      throw new BadRequestError("bad input");
    });

    const res = await app.fetch(new Request("http://localhost/fail"));
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.custom).toBe(true);
    expect(body.code).toBe(400);
  });

  it("onError hook can delegate to HttpException.getResponse() for default behaviour", async () => {
    const app = createServer();
    app.onError((err) => {
      if (isHttpException(err)) return err.getResponse();
    });

    app.get("/conflict", () => {
      throw new ConflictError("already exists");
    });

    const res = await app.fetch(new Request("http://localhost/conflict"));
    expect(res.status).toBe(409);
    const body = await res.json() as any;
    expect(body.error).toBe("Conflict");
  });

  it("onError hook receives plain Error when no HttpException is thrown", async () => {
    const app = createServer();
    let caughtMessage = "";
    app.onError((err, c) => {
      caughtMessage = err.message;
      return c.json({ caught: true }, 500);
    });

    app.get("/plain", () => {
      throw new Error("plain error");
    });

    await app.fetch(new Request("http://localhost/plain"));
    expect(caughtMessage).toBe("plain error");
  });
});
