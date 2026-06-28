import type { ListenCallback, Serve, Server } from "../server";
import type { ServeXAdapter } from "../types";
import { WebStandardAdapter } from "../web-standard";

export const CloudflareAdapter: ServeXAdapter = {
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
