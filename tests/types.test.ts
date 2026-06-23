import type { Equal, Expect } from "type-testing";
import { createServer } from "../src/index";
import type { AbsolutePath, NormalisePath } from "../src/router/types";
import type { ServeXRouter, TypedResponse } from "../src/types";

// Helper: extract the schema `S` from a ServeXRouter<E, S, B>
// biome-ignore lint/suspicious/noExplicitAny: infer bounds require any
type InferSchema<T> = T extends ServeXRouter<any, infer S, any> ? S : never;
// Helper: extract the base path `B` from a ServeXRouter<E, S, B>
type InferBase<T> = T extends { basePath: infer B }
	? B
	: // biome-ignore lint/suspicious/noExplicitAny: infer bounds require any
		T extends ServeXRouter<any, any, infer B>
		? B
		: never;

// ─── 0. NormalisePath sanity checks ──────────────────────────────────────────

type _N1 = Expect<Equal<NormalisePath<"/">, "/">>;
type _N2 = Expect<Equal<NormalisePath<"/api">, "/api">>;
type _N3 = Expect<Equal<NormalisePath<"/api/">, "/api">>; // strips trailing slash
type _N4 = Expect<Equal<NormalisePath<"api">, "/api">>; // adds leading slash
type _N5 = Expect<Equal<NormalisePath<"api/">, "/api">>; // both
type _N6 = Expect<Equal<NormalisePath<"/api/v1/">, "/api/v1">>;

// ─── 0b. AbsolutePath sanity checks ──────────────────────────────────────────

type _A1 = Expect<Equal<AbsolutePath<"/", "/users">, "/users">>; // root → identity
type _A2 = Expect<Equal<AbsolutePath<"/api", "/users">, "/api/users">>; // prefixed

// ─── 1. No basePath → root app, schema keys are just the route path ──────────

const basicApp = createServer()
	.get("/users", (c) => c.json([{ id: 1, name: "Alice" }]))
	.post("/submit", (c) => c.text("Done", 201));

type ExtractedBasic = InferSchema<typeof basicApp>;

type ExpectedBasicSchema = {
	"/users": {
		GET: Response & TypedResponse<{ id: number; name: string }[], 200, "json">;
	};
} & { "/submit": { POST: Response & TypedResponse<"Done", 201, "text"> } };

type _TestBasic = Expect<Equal<ExtractedBasic, ExpectedBasicSchema>>;

// ─── 2. basePath literal is inferred and normalised ──────────────────────────

// Canonical input: already normalised
const apiApp = createServer({ basePath: "/api/v1" });
type _TestBaseLiteralCanonical = Expect<
	Equal<typeof apiApp.basePath, "/api/v1">
>;
type _TestBaseGenericCanonical = Expect<
	Equal<InferBase<typeof apiApp>, "/api/v1">
>;

// Trailing-slash input: normalised to "/api"
const trailingApp = createServer({ basePath: "/api/" });
type _TestBaseLiteralTrailing = Expect<
	Equal<typeof trailingApp.basePath, "/api">
>;

// No-leading-slash input: normalised to "/api"
const noLeadingApp = createServer({ basePath: "api" });
type _TestBaseLiteralNoLeading = Expect<
	Equal<typeof noLeadingApp.basePath, "/api">
>;

// ─── 3. Route keys are absolute paths ────────────────────────────────────────

const routedApp = createServer({ basePath: "/api" })
	.get("/users", (c) => c.json({ users: [] }))
	.post("/items", (c) => c.text("Created", 201));

type ExtractedRouted = InferSchema<typeof routedApp>;

type ExpectedRoutedSchema = {
	"/api/users": {
		GET: Response & TypedResponse<{ users: never[] }, 200, "json">;
	};
} & {
	"/api/items": { POST: Response & TypedResponse<"Created", 201, "text"> };
};

type _TestRouted = Expect<Equal<ExtractedRouted, ExpectedRoutedSchema>>;

// ─── 4. Sub-routing: basePath + route() prefix both contribute ───────────────

const mainApp = createServer({ basePath: "/api" }).route("/v1", (r) => {
	return r.get("/health", (c) => c.json({ status: "OK" }));
});

type ExtractedMain = InferSchema<typeof mainApp>;

type ExpectedMainSchema = {
	"/api/v1/health": {
		GET: Response & TypedResponse<{ status: string }, 200, "json">;
	};
};

type _TestMain = Expect<Equal<ExtractedMain, ExpectedMainSchema>>;

// ─── 5. Path parameter type inference ────────────────────────────────────────

const paramApp = createServer({ basePath: "/api" }).get("/users/:id", (c) => {
	return c.json({ id: c.params("id") });
});

type ExtractedParam = InferSchema<typeof paramApp>;

type ExpectedParamSchema = {
	"/api/users/:id": {
		GET: Response & TypedResponse<{ id: string }, 200, "json">;
	};
};

type _TestParam = Expect<Equal<ExtractedParam, ExpectedParamSchema>>;

// ─── 6. Custom status codes ───────────────────────────────────────────────────

const statusApp = createServer({ basePath: "/api" }).delete("/users/:id", (c) =>
	c.text("Deleted", 204),
);

type ExtractedStatus = InferSchema<typeof statusApp>;

type ExpectedStatusSchema = {
	"/api/users/:id": {
		DELETE: Response & TypedResponse<"Deleted", 204, "text">;
	};
};

type _TestStatus = Expect<Equal<ExtractedStatus, ExpectedStatusSchema>>;

// ─── 7. No basePath → B defaults to "/" ──────────────────────────────────────

const noBaseApp = createServer();
type _TestNoBase = Expect<Equal<InferBase<typeof noBaseApp>, "/">>;

// ─── 8. c.json() accepts null and other JSONValue types ──────────────────────

// These compile without error — previously they would fail
const nullJsonApp = createServer();
nullJsonApp.get("/null", (c) => c.json(null));
nullJsonApp.get("/num", (c) => c.json(42));
nullJsonApp.get("/bool", (c) => c.json(true));
nullJsonApp.get("/arr", (c) => c.json([1, 2, 3]));
