import { createServer } from "../../src";

const app = createServer();
app.get("/", (c) => c.text("Hello World"));

export default {
  port: 3001,
  fetch: app.fetch
};
