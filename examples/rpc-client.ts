import { createClient } from "../client";
import { app, type App as TodoApp } from "./todo";

async function main() {
	// @ts-ignore: Type instantiation is excessively deep due to recursive schema mapping
	const client = createClient<TodoApp>("http://localhost:3000", {
		fetch: app.fetch,
	});

	console.log("Fetching all todos...");
	const allTodos = await client.todos.get();
	console.log(allTodos);

	console.log("\nCreating a new todo...");
	const newTodo = await client.todos.post({
		body: { title: "RPC from ServeX" },
	});
	console.log(newTodo);

	console.log("\nFetching the specific todo...");
	const singleTodo = await client.todos[":id"].get({
		params: { id: newTodo.data.id },
	});
	console.log(singleTodo);
}

main().catch(console.error);
