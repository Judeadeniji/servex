import { describe, it, expect } from "bun:test";
import { createServer } from "../src/index";

describe("queries()", () => {
  it("should return array of query parameters", async () => {
    const app = createServer();
    app.get("/search", (c) => c.json(c.queries("tags")));

    const res = await app.fetch(new Request("http://localhost/search?tags=action&tags=comedy"));
    expect(await res.json()).toEqual(["action", "comedy"]);
  });

  it("should return record of query parameters", async () => {
    const app = createServer();
    app.get("/search", (c) => c.json(c.queries()));

    const res = await app.fetch(new Request("http://localhost/search?tags=action&tags=comedy&sort=desc"));
    expect(await res.json()).toEqual({ tags: ["action", "comedy"], sort: ["desc"] });
  });

  it("should return null for missing parameter", async () => {
    const app = createServer();
    app.get("/search", (c) => c.json(c.queries("missing")));

    const res = await app.fetch(new Request("http://localhost/search?tags=action"));
    expect(await res.json()).toBeNull();
  });
});
