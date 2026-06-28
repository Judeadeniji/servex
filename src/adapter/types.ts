import type { ServeXApp } from "../app";
import type { Serve, ListenCallback, Server } from "./server";

export interface ServeXAdapter {
	name: string;
	listen: (
		app: ServeXApp<any, any, any>,
	) => (options: string | number | Partial<Serve>, callback?: ListenCallback) => Server;
	staticFile?: (path: string) => Response;
}
