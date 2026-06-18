import { createServer } from "../src/index";
import type { TypedResponse, ServeXRouter } from "../src/types";

import type { Expect, Equal } from "type-testing";

// Helper: extract the schema `S` from a ServeXRouter<S>
type InferSchema<T> = T extends ServeXRouter<any, infer S> ? S : never;

// ─── 1. Basic Type Schema Extraction ─────────────────────────────────────────

const basicApp = createServer()
  .get("/users", (c) => c.json([{ id: 1, name: "Alice" }]))
  .post("/submit", (c) => c.text("Done", 201));

type ExtractedBasic = InferSchema<typeof basicApp>;

type ExpectedBasicSchema =
  { "/users": { GET: Response & TypedResponse<{ id: number; name: string }[], 200, "json"> } } &
  { "/submit": { POST: Response & TypedResponse<"Done", 201, "text"> } };

type _TestBasic = Expect<Equal<ExtractedBasic, ExpectedBasicSchema>>;

// ─── 2. Sub-Routing / chaining ────────────────────────────────────────────────

const mainApp = createServer().route("/v1", (r) => {
  return r.get("/health", (c) => c.json({ status: "OK" }));
});

type ExtractedMain = InferSchema<typeof mainApp>;

type ExpectedMainSchema = {
  "/v1": {
    "/health": {
      GET: Response & TypedResponse<{ status: string }, 200, "json">;
    };
  };
};

type _TestMain = Expect<Equal<ExtractedMain, ExpectedMainSchema>>;

// ─── 3. Path parameter type inference ────────────────────────────────────────

const paramApp = createServer().get("/users/:id", (c) => {
  return c.json({ id: c.params("id") });
});

type ExtractedParam = InferSchema<typeof paramApp>;

type ExpectedParamSchema = {
  "/users/:id": {
    GET: Response & TypedResponse<{ id: string }, 200, "json">;
  };
};

type _TestParam = Expect<Equal<ExtractedParam, ExpectedParamSchema>>;

// ─── 4. Custom status codes ───────────────────────────────────────────────────

const statusApp = createServer().delete("/users/:id", (c) => c.text("Deleted", 204));

type ExtractedStatus = InferSchema<typeof statusApp>;

type ExpectedStatusSchema = {
  "/users/:id": {
    DELETE: Response & TypedResponse<"Deleted", 204, "text">;
  };
};

type _TestStatus = Expect<Equal<ExtractedStatus, ExpectedStatusSchema>>;
