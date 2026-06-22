import type { Context } from "../../context";
import type { NextFunction } from "../../types";

export interface LoggerOptions {
	/**
	 * Custom print function. Defaults to console.log
	 */
	print?: (str: string) => void;

	/**
	 * Function to format the log message.
	 */
	format?: (data: LogData) => string;
}

export interface LogData {
	method: string;
	path: string;
	status: number;
	durationMs: number;
}

const colorize = (status: number) => {
	if (status >= 500) return `\x1b[31m${status}\x1b[0m`; // Red
	if (status >= 400) return `\x1b[33m${status}\x1b[0m`; // Yellow
	if (status >= 300) return `\x1b[36m${status}\x1b[0m`; // Cyan
	if (status >= 200) return `\x1b[32m${status}\x1b[0m`; // Green
	return `\x1b[0m${status}\x1b[0m`; // Default
};

const defaultFormat = (data: LogData) => {
	const method = `\x1b[1m${data.method}\x1b[0m`;
	const time = `${data.durationMs.toFixed(2)}ms`;
	return `--> ${method} ${data.path} ${colorize(data.status)} ${time}`;
};

/**
 * A robust built-in logger middleware.
 * Logs the method, path, status code, and response time.
 */
export const logger = (options: LoggerOptions = {}) => {
	const print = options.print ?? console.log;
	const format = options.format ?? defaultFormat;

	return async (c: Context, next: NextFunction) => {
		const start = performance.now();
		const method = c.req.method;
		const path = c.req.url ? new URL(c.req.url).pathname : "/";

		try {
			await next();
		} finally {
			// Defer the actual logging until the response is sent to the client.
			c.defer(() => {
				const durationMs = performance.now() - start;
				const status = c.finalResponse?.status || 200;

				print(
					format({
						method,
						path,
						status,
						durationMs,
					}),
				);
			});
		}
	};
};
