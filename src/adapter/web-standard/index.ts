import type { ListenCallback, Serve, Server } from "../server";
import type { ServeXAdapter } from "../types";

export const WebStandardAdapter: ServeXAdapter = {
	name: "web-standard",
	listen: () => {
		return (
			_portOrOptions: string | number | Partial<Serve>,
			_callback?: ListenCallback,
		): Server => {
			throw new Error(
				"WebStandard does not support listen, you might want to export the app instance or use its fetch handler instead",
			);
		};
	},
};
