import { createServer } from "../../src";

const app = createServer({ basePath: "api" }).trace((() => { console.log("Request received") })).get("/", (c) => c.text("Hello World"));

export default {
  port: 3001,
  fetch: app.fetch
};
