import type { ServeOptions } from "bun";
import type { ListenCallback, Serve, Server } from "../server";
import type { ServeXAdapter } from "../types";

export const BunAdapter: ServeXAdapter = {
	name: "bun",
	staticFile: (path: string) => {
		return new Response(Bun.file(path), {
			headers: { "Content-Type": "text/html; charset=UTF-8" },
		});
	},
	listen: (app) => {
		return (
			portOrOptions: string | number | Partial<Serve>,
			callback?: ListenCallback,
		): Server => {
			let options: Partial<ServeOptions> = {};
			if (
				typeof portOrOptions === "number" ||
				typeof portOrOptions === "string"
			) {
				options = { port: portOrOptions };
			} else {
				options = portOrOptions;
			}

			const server = Bun.serve({
				...options,
				// @ts-ignore: Bun's fetch expects `this: Server` but our stored arrow function is compatible at runtime
				fetch: app.fetch,
			});

			if (callback) {
				callback(server);
			}

			return server;
		};
	},
};
