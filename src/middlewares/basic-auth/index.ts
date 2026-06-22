import type { Context } from "../../context";
import type { NextFunction } from "../../types";

export interface BasicAuthOptions {
	/**
	 * The valid username. Required unless `verifyUser` is provided.
	 */
	username?: string;

	/**
	 * The valid password. Required unless `verifyUser` is provided.
	 */
	password?: string;

	/**
	 * A custom verification function.
	 * If provided, `username` and `password` options are ignored.
	 */
	verifyUser?: (
		c: Context,
		credentials: { username: string; password: string },
	) => boolean | Promise<boolean>;

	/**
	 * The realm name to display in the browser's login prompt.
	 * @default "Secure Area"
	 */
	realm?: string;

	/**
	 * Optional function to execute when authentication fails.
	 */
	onFail?: (c: Context) => Response | Promise<Response>;
}

/**
 * Compares two strings in constant time to prevent timing attacks.
 */
const timingSafeEqual = (a: string, b: string): boolean => {
	let result = 0;
	if (a.length !== b.length) {
		// If lengths differ, we still do a comparison against itself to keep timing similar,
		// though the initial check leaks the fact that lengths differ.
		b = a;
		result = 1;
	}
	for (let i = 0; i < a.length; i++) {
		result |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return result === 0;
};

/**
 * Basic Authentication Middleware
 */
export const basicAuth = (options: BasicAuthOptions) => {
	if (!options.verifyUser && (!options.username || !options.password)) {
		throw new Error(
			"basicAuth middleware requires either username/password or a verifyUser function",
		);
	}

	const realm = options.realm ?? "Secure Area";
	// We use quotes around realm in the header
	const authHeaderValue = `Basic realm="${realm.replace(/"/g, '\\"')}"`;

	return async (c: Context, next: NextFunction) => {
		const authHeader = c.req.headers.get("Authorization");

		if (!authHeader?.toLowerCase().startsWith("basic ")) {
			c.setHeaders({ "WWW-Authenticate": authHeaderValue });
			if (options.onFail) return options.onFail(c);
			return c.text("Unauthorized", 401);
		}

		try {
			const base64Credentials = authHeader.slice(6).trim();
			const credentials = atob(base64Credentials);
			const colonIndex = credentials.indexOf(":");

			if (colonIndex === -1) {
				throw new Error("Malformed credentials");
			}

			const reqUsername = credentials.slice(0, colonIndex);
			const reqPassword = credentials.slice(colonIndex + 1);

			let authorized = false;

			if (options.verifyUser) {
				authorized = await options.verifyUser(c, {
					username: reqUsername,
					password: reqPassword,
				});
			} else {
				const userMatch = timingSafeEqual(reqUsername, options.username!);
				const passMatch = timingSafeEqual(reqPassword, options.password!);
				authorized = userMatch && passMatch;
			}

			if (authorized) {
				return next();
			}
		} catch (_err) {
			// Catch atob errors (invalid base64) or custom verifyUser errors
		}

		c.setHeaders({ "WWW-Authenticate": authHeaderValue });
		if (options.onFail) return options.onFail(c);
		return c.text("Unauthorized", 401);
	};
};
