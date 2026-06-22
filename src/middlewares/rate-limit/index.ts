import type { Context } from "../../context";
import type { NextFunction } from "../../types";

export interface RateLimitStore {
	/**
	 * Increment the hit count for a given key.
	 * @returns The total hit count in the current window, and the unix timestamp (in ms) when the window resets.
	 */
	increment(
		key: string,
		windowMs: number,
	): Promise<{ count: number; resetTime: number }>;
}

export class MemoryRateLimitStore implements RateLimitStore {
	private hits = new Map<string, { count: number; resetTime: number }>();

	async increment(
		key: string,
		windowMs: number,
	): Promise<{ count: number; resetTime: number }> {
		const now = Date.now();
		let record = this.hits.get(key);

		if (!record || record.resetTime < now) {
			record = { count: 0, resetTime: now + windowMs };
		}

		record.count++;
		this.hits.set(key, record);

		// Randomised cleanup to prevent memory leaks from old keys
		if (Math.random() < 0.05) {
			this.cleanup(now);
		}

		return record;
	}

	private cleanup(now: number) {
		for (const [key, record] of this.hits.entries()) {
			if (record.resetTime < now) {
				this.hits.delete(key);
			}
		}
	}
}

export interface RateLimitOptions {
	/**
	 * The maximum number of requests allowed in the time window.
	 * @default 100
	 */
	limit?: number;

	/**
	 * The time window in seconds.
	 * @default 60
	 */
	window?: number;

	/**
	 * Function to extract the identifier to rate limit on (e.g., IP address, user ID).
	 * @default (c) => c.req.headers.get("x-forwarded-for") || c.req.headers.get("cf-connecting-ip") || "global"
	 */
	keyGenerator?: (c: Context) => string | Promise<string>;

	/**
	 * Custom store adapter to persist rate limit counts (useful for multi-instance deployments).
	 * Defaults to an in-memory store.
	 */
	store?: RateLimitStore;

	/**
	 * Message or custom Response to return when the rate limit is exceeded.
	 * @default "Too Many Requests"
	 */
	message?: string | ((c: Context) => Response);
}

/**
 * Middleware for basic Fixed Window Rate Limiting.
 */
export const rateLimiter = (options: RateLimitOptions = {}) => {
	const limit = options.limit ?? 100;
	const windowMs = (options.window ?? 60) * 1000;
	const store = options.store ?? new MemoryRateLimitStore();

	const keyGenerator =
		options.keyGenerator ??
		((c) => {
			return (
				c.req.headers.get("x-forwarded-for") ||
				c.req.headers.get("cf-connecting-ip") ||
				"global"
			);
		});

	const message = options.message ?? "Too Many Requests";

	return async (c: Context, next: NextFunction) => {
		const key = await keyGenerator(c);
		const { count, resetTime } = await store.increment(key, windowMs);

		// Set standard rate limit headers
		c.setHeaders({
			"X-RateLimit-Limit": limit.toString(),
			"X-RateLimit-Remaining": Math.max(0, limit - count).toString(),
			"X-RateLimit-Reset": Math.ceil(resetTime / 1000).toString(),
		});

		if (count > limit) {
			c.setHeaders({
				"Retry-After": Math.ceil((resetTime - Date.now()) / 1000).toString(),
			});

			if (typeof message === "function") {
				return message(c);
			}
			return c.text(message, 429);
		}

		return next();
	};
};
