import { Elysia } from "elysia";

const app = new Elysia();
app.get("/", () => "Hello World");

export default {
  port: 3003,
  fetch: app.fetch
};
