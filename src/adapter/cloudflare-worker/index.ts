import type { ListenCallback, Serve, Server } from "../server";
import type { ServeXAdapter } from "../types";
import { WebStandardAdapter } from "../web-standard";

/**
 * Cloudflare Workers adapter.
 *
 * Inherits the web-standard `handler` bag (JSON via `JSON.stringify`, explicit
 * content-type headers). `listen()` is a no-op with a console warning since
 * Cloudflare Workers are invoked via `export default` rather than port binding.
 *
 * @example
 * ```ts
 * import { ServeX } from "servex";
 * import { CloudflareAdapter } from "servex/adapter/cloudflare-worker";
 *
 * const app = new ServeX({ adapter: CloudflareAdapter })
 *   .get("/", () => "Hello from Cloudflare!")
 *
 * export default app; // Cloudflare picks up `app.fetch`
 * ```
 */
export const CloudflareAdapter: ServeXAdapter = {
	// Inherit web-standard handler bag — no Bun.serve-specific APIs used.
	...WebStandardAdapter,
	name: "cloudflare-worker",

	listen: () => {
		return (
			_portOrOptions: string | number | Partial<Serve>,
			_callback?: ListenCallback,
		): Server => {
			console.warn(
				"Cloudflare Worker does not support listen method. Please export default ServeX instance instead.",
			);
			return {
				port: 0,
				hostname: "localhost",
				stop: () => {},
			};
		};
	},
};
