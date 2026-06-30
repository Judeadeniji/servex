# The Context Object

The `Context` (commonly abbreviated as `c`) is the central object passed into every handler, middleware, and lifecycle hook. It encapsulates the incoming Request and provides performant, type-safe utilities to parse data, read parameters, manage execution lifecycles, and construct a Response.

## 1. Request Data & Parsing

ServeX provides optimized helpers to read the incoming body and URL data.

- **`c.req`**: The underlying standard Fetch Request object.
- **`c.req.json()`**: Reads and parses the body as JSON.
- **`c.formData()`**: Reads and parses the body as a `FormData` object.
- **`c.urlEncoded()`**: Reads the body as `URLSearchParams`.

### URL Parameters
- **`c.params("id")`**: Gets a path parameter (e.g., from `/users/:id`).
- **`c.query("search")`**: Gets the first value of a query parameter.
- **`c.queries("tags")`**: Gets an array of all values for a query parameter (e.g., `?tags=a&tags=b`).

### Validation Data
- **`c.valid(target)`**: If you use the `validator` middleware, this returns strictly-typed data. Targets can be `"body"`, `"query"`, or `"params"`.

## 2. State & Environment

Data can be safely shared across middlewares and passed to downstream handlers using Context variables.

- **`c.set("key", value)`**: Sets a strongly-typed request-scoped variable.
- **`c.get("key")`**: Retrieves a variable.
- **`c.env`**: Gives you access to runtime environment variables and bindings (like Cloudflare KV, D1, or Node `process.env`).

## 3. Modifying the Response

Before sending a response, you can alter cookies and headers natively through the context.

- **`c.setCookie(name, value, options)`**: Sets a single cookie.
- **`c.setCookies(cookiesObj, options)`**: Sets multiple cookies at once.
- **`c.setHeaders({ "Cache-Control": "..." })`**: Appends or overwrites outgoing response headers.
- **`c.header()`**: Returns the mutable `Headers` object attached to the outgoing response.

## 4. Constructing Responses

ServeX abstracts away the boilerplate of manually instantiating `new Response()` objects.

- **`c.json(obj, status?)`**: Returns a JSON response with the correct `application/json` headers.
- **`c.text(string, status?)`**: Returns a plain text response.
- **`c.html(string, status?)`**: Returns an HTML response.
- **`c.redirect(url, status?)`**: Sends a redirect (defaults to 302).
- **`c.notFound()`**: Immediately returns a 404 response.
- **`c.error(status, message?)`**: Throws an `HttpException` which is instantly caught by the global error handler.

## 5. Lifecycles & Advanced Utilities

- **`c.defer(fn)`**: Pushes a function to be executed *after* the client has successfully received the response. Ideal for non-blocking logging or analytics.
- **`c.routine()`**: Returns the current hierarchical `SignalContext`. Useful for branching Go-style contexts to manage deadlines and spawned background tasks.
- **`c.setRoutine(signalCtx)`**: Overrides the active routine for the rest of the request lifecycle.
- **`c.executionCtx`**: Access to the underlying serverless execution context (e.g., Cloudflare's `ctx.waitUntil()`).
