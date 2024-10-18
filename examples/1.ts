import { serve } from "bun";
import { createServer } from "../src";
import { route } from "../src/router";
import { context, params, request } from "../src/hooks";
import { HttpException } from "../src/http-exception";
import type { Context, MiddlewareHandler } from "../src/types";
import { RouterType } from "../src/router/adapter";


const homeRoute = route("GET /home", (c) => {
  return c.text("Hello World\n");
}, {
  children: [
    route("GET /status", (c) => c.text(`${c.status}`))
  ]
})

const server = createServer({
  routes: [homeRoute]
});

const bun_server = serve({
  fetch: server.fetch,
});

(async () =>{
  const d = await server.request("http://localhost:3000");

  console.log(d)
})()


