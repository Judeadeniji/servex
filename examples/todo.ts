import { BadRequestError, createServer, NotFoundError } from "../index";
import { cors } from "../src/middlewares/cors";
import { logger } from "../src/middlewares/logger";

interface Todo {
	id: string;
	title: string;
	completed: boolean;
	// biome-ignore lint/suspicious/noExplicitAny: c
	[key: string]: any;
}

// In-memory store
const todos: Map<string, Todo> = new Map();

// Seed with some initial data
const initialId = crypto.randomUUID();
todos.set(initialId, {
	id: initialId,
	title: "Learn ServeX Framework",
	completed: false,
});

// fallow-ignore-next-line unused-export Example app is imported by rpc-client.ts
export const app = createServer()
	.use(logger())
	.use(cors())
	.get("/health", (c) => c.json({ status: "ok" }))
	.get("/todos", (c) => {
		const allTodos = Array.from(todos.values());
		return c.json({ data: allTodos });
	})
	.get("/todos/:id", (c) => {
		const { id } = c.params();
		const todo = todos.get(id);

		if (!todo) {
			throw new NotFoundError("Todo not found");
		}

		return c.json({ data: todo });
	})
	.post("/todos", async (c) => {
		const body = await c.req.json<Partial<Todo>>().catch(() => null);

		if (!body?.title) {
			throw new BadRequestError("Title is required");
		}

		const newTodo: Todo = {
			id: crypto.randomUUID(),
			title: body.title,
			completed: false,
		};

		todos.set(newTodo.id, newTodo);
		return c.json({ data: newTodo }, 201);
	})
	.put("/todos/:id", async (c) => {
		const { id } = c.params();
		const todo = todos.get(id);

		if (!todo) {
			throw new NotFoundError("Todo not found");
		}

		const body = await c.req.json<Partial<Todo>>().catch(() => null);
		if (!body) {
			throw new BadRequestError("Invalid request body");
		}

		const updatedTodo: Todo = {
			...todo,
			title: body.title ?? todo.title,
			completed: body.completed ?? todo.completed,
		};

		todos.set(id, updatedTodo);
		return c.json({ data: updatedTodo });
	})
	// fallow-ignore-next-line unused-param Fallow thinks this is unused but c.params() is called
	.delete("/todos/:id", (c) => {
		const { id } = c.params();

		if (!todos.has(id)) {
			throw new NotFoundError("Todo not found");
		}

		todos.delete(id);
		return new Response(null, { status: 204 });
	});

export type App = typeof app;
// Start the server using Bun.serve
const port = 3000;
// Bun.serve({
// 	port,
// 	fetch: app.fetch,
// });

console.log(`🚀 Todo API is running at http://localhost:${port}`);
