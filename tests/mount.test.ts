import { describe, it, expect } from "bun:test";
import { createServer } from "../src/index";

describe("Mounting another app", () => {
  it("should support mounting a sub-app instance", async () => {
    const subApp = createServer();
    subApp.get("/hello", (c) => c.text("world"));

    const mainApp = createServer();
    mainApp.route("/api", subApp);

    const res = await mainApp.fetch(new Request("http://localhost/api/hello"));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("world");
  });
});
