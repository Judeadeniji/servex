import { describe, expect, it } from "bun:test";
import { createServer } from "../../app";
import { showRoutes } from "./index";

describe("Helpers: showRoutes", () => {
  it("should return a formatted string when returnString is true", () => {
    const app = createServer();
    app.get("/", () => new Response("OK"));
    app.post("/users", () => new Response("OK"));
    app.put("/users/:id", () => new Response("OK"));

    const output = showRoutes(app, { returnString: true }) as string;
    
    expect(output).toContain("Registered Routes:");
    expect(output).toContain("GET");
    expect(output).toContain("/");
    expect(output).toContain("POST");
    expect(output).toContain("/users");
    expect(output).toContain("PUT");
    expect(output).toContain("/users/:id");
  });

  it("should return a message if no routes are registered", () => {
    const app = createServer();
    const output = showRoutes(app, { returnString: true }) as string;
    expect(output).toBe("No routes registered.");
  });
});
