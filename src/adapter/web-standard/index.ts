import type { ListenCallback, Serve, Server } from "../server";
import type { ServeXAdapter } from "../types";
import {
	createStaticHandler,
	mapCompactResponse,
	mapEarlyResponse,
	mapResponse,
} from "./handler";

export const WebStandardAdapter: ServeXAdapter = {
	name: "web-standard",

	handler: {
		mapResponse,
		mapEarlyResponse,
		mapCompactResponse,
		createStaticHandler,
	},

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
