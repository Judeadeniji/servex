import { serve } from "bun";
import { createServer } from "../src";
import { route } from "../src/router";
import { context, params, request } from "../src/hooks";
import { HttpException } from "../src/http-exception";
import type { Context, MiddlewareHandler } from "../src/types";
import { RouterType } from "../src/router/adapter";

let todos: { id: number; task: string }[] = [];
let nextId = 1;

const singleTodo = route("GET /:id", (c) => {
  const id = parseInt(params("id")!);
  const todo = todos.find((todo) => todo.id === id);
  if (!todo) {
    throw new HttpException(404, "Todo Not found");
  }
  return c.json(todo);
});

const listTodos = route(
  "GET /todos",
  (c) => {
    // const c = context();
    return c
      .setHeaders({
        "Content-Type": "text/plain",
      })
      .json(todos);
  },
  {
    children: [singleTodo],
    middlewares: [
      async (c, n) => {
        console.log("M1 start");
        await n();
        console.log("M1 end");
      },
      async (c, n) => {
        console.log("M2 start");
        await n();
        console.log("M2 end");
      },
      async (c, n) => {
        console.log("M3 start");
        await n();
        console.log("M3 end");
      },
    ],
  }
);

const addTodo = route("POST /todos", async (c) => {
  const { task } = await request().json<{
    task: string
  }>();
  const newTodo = { id: nextId++, task };
  todos.push(newTodo);
  return c
    .setCookies({
      bar: "cruz",
      foo: "baz",
    })
    .json(newTodo, 201);
});

const deleteTodo = route("DELETE /todos/:id", (c) => {
  const id = parseInt(c.params("id")!);
  todos = todos.filter((todo) => todo.id !== id);
  return new Response(null, { status: 204 });
});

const loggerMiddleware: MiddlewareHandler<Context> = async (_, next) => {
  const c = context();
  console.log(`[${new Date().toISOString()}] ${c.req.method} ${c.req.url}`);
  await next();
  console.log("Response sent");
};

const delayMiddleware: MiddlewareHandler<Context> = async (_, next) => {
    await new Promise((r) => setTimeout(r, 500));
    await next();
};

const server = createServer({
  router: RouterType.RADIX,
  routes: [listTodos, addTodo, deleteTodo],
  middlewares: [loggerMiddleware, delayMiddleware],
});

serve({
  port: 3000,
  fetch: server.fetch,
});
