import type { Context } from "../../context";
import { getCookie } from "../../helpers/cookie";
import { type Algorithm, verify } from "../../helpers/jwt";
import type { NextFunction } from "../../types";

export interface JwtOptions {
	/**
	 * The secret key used to verify the JWT.
	 */
	secret: string;

	/**
	 * The algorithm used to verify the JWT. Defaults to HS256.
	 */
	alg?: Algorithm;

	/**
	 * Optional name of the cookie to extract the JWT from.
	 * If provided, the middleware will check the cookie in addition to the Authorization header.
	 */
	cookie?: string;

	/**
	 * Optional function to execute when JWT verification fails or is missing.
	 * If not provided, it will return a 401 Unauthorized response by default.
	 */
	onFail?: (c: Context, err: Error) => Response | Promise<Response>;
}

/**
 * JWT Authentication Middleware
 *
 * Verifies a JWT token from the `Authorization: Bearer <token>` header or a specified cookie.
 * Upon successful verification, the decoded payload is stored in Context under the key `"jwtPayload"`.
 */
export const jwt = (options: JwtOptions) => {
	if (!options.secret) throw new Error("JWT middleware requires a secret");
	const alg = options.alg ?? "HS256";

	return async (c: Context, next: NextFunction) => {
		let token: string | undefined;

		// 1. Try to extract from cookie if configured
		if (options.cookie) {
			token = getCookie(c, options.cookie);
		}

		// 2. Try to extract from Authorization header
		if (!token) {
			const authHeader = c.req.headers.get("Authorization");
			if (authHeader?.startsWith("Bearer ")) {
				token = authHeader.slice(7);
			}
		}

		if (!token) {
			const err = new Error("Missing JWT token");
			if (options.onFail) return options.onFail(c, err);
			return c.text("Unauthorized", 401);
		}

		try {
			const payload = await verify(token, options.secret, alg);
			c.set("jwtPayload", payload);
			return next();
		} catch (err: unknown) {
			const error = err instanceof Error ? err : new Error(String(err));
			if (options.onFail) return options.onFail(c, error);
			return c.text(error.message || "Unauthorized", 401);
		}
	};
};
