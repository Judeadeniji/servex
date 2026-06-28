export interface Server {
	/**
	 * Stop listening to prevent new connections from being accepted.
	 */
	stop?(closeActiveConnections?: boolean): void;
	/**
	 * The port the server is listening on
	 */
	port: number;
	/**
	 * The hostname the server is listening on.
	 */
	hostname: string;
}

export interface Serve {
	port?: string | number;
	hostname?: string;
	development?: boolean;
	[key: string]: unknown;
}

export type ListenCallback = (server: Server) => void | Promise<void>;
